import FvStore from "./store";
import { Edition } from "./edition";
import { evaluateXPath, findElementByXmlId } from "../tei-processing/helpers";

interface PointerData {
    ptrElement: Element;
    groupId: string;
    edition: Edition;
    referencedUrl: string;
    referencedTarget: string;

    dereferenced?: Element;
}

export class Apparatus {  // Content of the <app> tag
    public readonly id: string;
    public readonly n: number | undefined;
    public readonly element: Element;

    public pointers: PointerData[];

    constructor(element: Element) {
        this.element = element;

        const idAttr = element.attributes.getNamedItem('xml:id')
        if (!idAttr) {
            throw new Error('<app> tag with no xml:id');
        }
        this.id = idAttr.value;

        const nAttr = element.attributes.getNamedItem('n');
        this.n = nAttr ? parseInt(nAttr.value) : undefined;

        this.pointers = this.parsePointers();
    }

    private parsePointers() {
        const ptrElements = Array.from(this.element.getElementsByTagName('ptr'));
        const ptrs = ptrElements.map((el) => this.parsePointer(el));

        return ptrs;
    }

    private parsePointer(ptrElement: Element): PointerData {
        const rdgElement = ptrElement.parentNode as Element;
        if (!rdgElement || rdgElement.tagName !== 'rdg') {
            throw new Error(`Parent of <ptr> is not <rdg>`);
        }
        const witAttr = rdgElement.attributes.getNamedItem('wit');
        if (!witAttr) {
            throw new Error('<rdg> element does not have a wit attribute');
        }
        const editionCode = witAttr.value.substr(2);  // with is #f1818, #fMS etc...
        let edition: Edition;
        try {
            edition = FvStore.getEdition(editionCode);
        } catch(err) {
            throw new Error(`<rdg> has invalid witness ${witAttr.value}`);
        }

        const rdgGroupElement = rdgElement.parentNode as Element;
        if(!rdgGroupElement || rdgGroupElement.tagName !== 'rdgGrp') {
            throw new Error(`Parent of <rdg> element is not <rdgGrp>`);
        }
        const grpIdAttr = rdgGroupElement.attributes.getNamedItem('xml:id');
        if (!grpIdAttr) {
            throw new Error('<rdrGrp> has no xml:id');
        }
        const groupId = grpIdAttr.value;

        const targetAttr = ptrElement.attributes.getNamedItem('target');
        if (!targetAttr) {
            throw new Error(`<ptr> element has not target attribute`);
        }

        const parts = targetAttr.value.split('#')
        if (parts.length !== 2) {
            throw new Error(`Target ${targetAttr.value} is not well formatted. Expected uri#xpath`);
        }

        return {
            ptrElement,
            edition,
            groupId,
            referencedUrl: parts[0],
            referencedTarget: parts[1],
        };
    }
}

interface StringRange {
    xpath: string,
    start: number,
    length: number,
}


export class Spine {
    public readonly chunkNumber: number;
    private _apps: Apparatus[] | undefined;
    private _xml: Document | undefined;
    private _initialized = false;
    private static mockElementCount = 0;
    
    constructor(chunk: number) {
        this.chunkNumber = chunk;
    }

    public async initialize() {
        if (this._initialized) {
            return;
        }

        this._xml = await this.getXML();
        await this.parseApps();
        await this.fetchAllReferences();
        await this.rewriteStringRanges();
        await this.dereferencePointers();
        this.addBackPointers();
        
        this._initialized = true;
    }

    private async getXML() {
        const chunkStr = this.chunkNumber < 10 ? `0${this.chunkNumber}` : `${this.chunkNumber}`;
        const url = `https://raw.githubusercontent.com/PghFrankenstein/fv-data/master/standoff_Spine/spine_C${chunkStr}.xml`

        return await FvStore.cache.getXML(url);
    }

    private async parseApps() {
        if(!this._xml) {
            throw new Error('parseApps called before getXML, which makes no sense')
        }

        const appElements = Array.from(this._xml.getElementsByTagName('app'));
        const apps = appElements.map((app) => new Apparatus(app));
        this._apps = apps;
    }

    public get apps(): Apparatus[] {
        if (!this._apps) {
            throw new Error(`Spine not initialized yet`);
        }
        return this._apps;
    }

    // Download all referenced XMLs concurrently (if they're not cached)
    private async fetchAllReferences() {
        console.debug(`Fetching all URLs referenced by chunk ${this.chunkNumber}`);

        let allUrls = [] as string[];

        for(let app of this.apps) {
            const urls = app.pointers.map((ptr) => ptr.referencedUrl);
            allUrls = allUrls.concat(urls);
        }

        const unique = Array.from(new Set<string>(allUrls));
        const promises = unique.map((url) => FvStore.cache.getXML(url));
        await Promise.all(promises);  // Returns only once all URLs have been fetched
    }

    // Rewrite string ranges to ordinary pointers. 
    // This is done by adding tags in the target XML with their own ID surrounding the relevant text elements

    private async rewriteStringRanges() {
        const re = /^string-range\((?<xpath>.+),(?<start>\d+),(?<length>\d+)\)$/;
        
        for(let app of this.apps) {
            const invalidPointers = new Set<PointerData>();
            for(let ptr of app.pointers) {
                const match = ptr.referencedTarget.match(re);
                if (match) {
                    const stringRange = {
                        xpath: match.groups!.xpath,
                        start: parseInt(match.groups!.start),
                        length: parseInt(match.groups!.length),
                    };
                    try {
                        await this.rewriteStringRange(ptr, stringRange);
                    } catch(err) {
                        invalidPointers.add(ptr);
                    }
                }
            }

            const validPointers = app.pointers.filter((ptr) => !invalidPointers.has(ptr));
            app.pointers = validPointers;
        }
    }

    private async rewriteStringRange(ptr: PointerData, range: StringRange) {
        // For now - just get the xml:id of the target element and replace the pointer's target.
        // Add an xml:id if none exists on the target element
        const targetDoc = await FvStore.cache.getXML(ptr.referencedUrl);

        // The xpath has a bug - it references the 'tei' namespace which is not defined in the spine files - 
        // the default namespace is the tei namespace there. So we just drop all 'tei:' from the xpath
        const patchedXPath = range.xpath.replace(/tei:/g, '');
        const targetNodes = evaluateXPath(targetDoc, patchedXPath);

        if (targetNodes.length === 0) {
            console.error(`string-range for xpath ${patchedXPath} failed to return a node`);
            throw Error('string-range returned no nodes');
        }

        if (targetNodes.length > 1) {
            console.error(`string-range for xpath ${patchedXPath} returned more than one node`);
            throw Error('string-range returned more than one node');
        }

        const targetElement = targetNodes[0] as Element;
        const idAttr = targetElement.attributes.getNamedItem('xml:id');
        let xmlId = '';
        if (idAttr) {
            xmlId = idAttr.value;
        } else {
            xmlId = `mock-id-${Spine.mockElementCount}`;
            Spine.mockElementCount += 1;

            // No xml:id - add a mock one

            targetElement.setAttribute('xml:id', xmlId);
        }

        // Update the Pointer
        ptr.referencedTarget = xmlId;  // In memory
        ptr.ptrElement.setAttribute('target', `${ptr.referencedTarget}#${xmlId}`); // In the DOM
    }

    private async dereferencePointers() {
        for(let app of this.apps) {
            for(let ptr of app.pointers) {
                const document = await FvStore.cache.getXML(ptr.referencedUrl);
                const element = findElementByXmlId(document, ptr.referencedTarget);
                ptr.dereferenced = element;
            }
        }
    }

    private addBackPointers() {
        // We will add the back pointers to all editions while we're at it
        // Backpointers are an attribute - app-ref, which contains the id of the app element
        for(let app of this.apps) {
            for(let ptr of app.pointers) {
                if (!ptr.dereferenced) {
                    console.error('Non dereferenced pointed in addBackPointers - pointers should all be dereferenced by now');
                    continue;
                }
                ptr.dereferenced!.setAttribute('app-ref', app.id);
            }
        }
    }

}
