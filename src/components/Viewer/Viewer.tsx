import React from 'react';
import EditionSelector from '../EditionSelector/EditionSelector';
import TeiRendering from '../TeiRendering/TeiRendering';
import FvStore from '../../data/store';
import { Edition, Chunk } from '../../data/edition';
import Paging from '../Paging/Paging';
import Header from '../Header/Header';
import OptionsSelector from '../OptionsSelector/OptionsSelector';
import '../../styles/general.sass';

interface ViewerProperties { }

interface ViewerState {
    loading: boolean,
    chunk?: Chunk,
    edition?: Edition,
    showVariations: boolean,
    showText: boolean,
}

class Viewer extends React.Component <ViewerProperties, ViewerState> {
    state = {
        loading: false,
        chunk: undefined as Chunk | undefined,
        edition: undefined as Edition | undefined,
        chunkNumber: 0,

        showVariations: true,
        showText: true,
    }

    
    onNewChunk = async (chunkNumber: number) => {
        this.setState( {loading: true, chunk: undefined } );
        
        if (!this.state.edition) {
            throw new Error("Cannot get chunk if there is no an edition");
        }
        const chunk = await Chunk.load(this.state.edition, chunkNumber);
        this.setState( {loading: false, chunk } );
    }

    onNewEdition = (edition: Edition) => {
        this.setState( {edition } );
    }
    onVariation = (show: boolean) => {
        this.setState( { showVariations: show } );
    }
    onText = (show: boolean) => {
        this.setState( { showText: show } );
    }

    render() {
        return (
            <div>
                <EditionSelector 
                editions={FvStore.editions} 
                edition={this.state.edition!}
                onEditionSelected={this.onNewEdition}
                />

                <Paging 
                edition={this.state.edition} 
                chunk={this.state.chunkNumber}
                onChunkSelected={this.onNewChunk} />

                <OptionsSelector 
                showVariations={this.state.showVariations}
                showText={this.state.showText}
                onVariationChanged={this.onVariation}
                onTextChanged={this.onText}
                />
                
                <Header
                edition={this.state.edition} />

                { this.state.chunk && this.state.edition ? 
                <TeiRendering
                chunk={this.state.chunk}
                edition={this.state.edition}
                showVariations={this.state.showVariations}
                showText={this.state.showText} /> : '' }


                <hr className='line' />
                <EditionSelector 
                editions={FvStore.editions} 
                edition={this.state.edition!}
                onEditionSelected={this.onNewEdition}
                />
                <Paging 
                edition={this.state.edition} 
                chunk={this.state.chunkNumber}
                onChunkSelected={this.onNewChunk} />
            </div>
        );
    }
}

export default Viewer;
