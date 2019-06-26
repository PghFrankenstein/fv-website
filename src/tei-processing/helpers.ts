
export function evaluateXPath(doc: Document, xpath: string): Node[] {
    const resolver = doc.createNSResolver(doc.documentElement);
    const xpathResult = doc.evaluate(xpath, doc, resolver);
    const nodes: Node[] = [];

    let node = xpathResult.iterateNext();
    while(node) {
        nodes.push(node);
        node = xpathResult.iterateNext();
    }

    return nodes;
}

export function findElementByXmlId(doc: Document, xmlId: string): Element {
    const xpath = `//*[@xml:id="${xmlId}"]`;
    const idResults = evaluateXPath(doc, xpath);

    if (idResults.length === 0) {
        throw Error(`Pointer ${xmlId} references an invalid element`);
    } else if (idResults.length > 1) {
        throw Error(`Pointer ${xmlId} references more than one element`);
    }
    return idResults[0] as Element;
}
