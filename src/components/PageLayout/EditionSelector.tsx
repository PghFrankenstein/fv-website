import React from 'react';
import Select from 'react-select';
import { Edition } from '../../data/edition';
import FvStore from '../../data/store';
import '../../styles/general.sass';
import EditionDot from '../helpers/EditionDot';

export interface SelectOption {
    value: string;
    label: any;// HTMLSpanElement;
}

interface EditionSelectorProps {
    editions: Edition[],
    edition: Edition,

    onEditionSelected: (edition: Edition) => void;
}

interface EditionSelectorState {
    availableEditions: SelectOption[],
    selectedEdition: SelectOption | undefined,
}

class EditionSelector extends React.Component<EditionSelectorProps, EditionSelectorState> {

    state = {
        availableEditions: [] as SelectOption[],
        selectedEdition: undefined as SelectOption | undefined,
    }
    
    componentDidMount = () => {
        const editions = FvStore.editions.map((ed, index) => ({ key: index, value: ed.code, label: <label><EditionDot edition={ ed }/>{ed.name}</label> } as SelectOption));

        this.setState({ availableEditions: editions, });
    }

    componentDidUpdate(prevProps: EditionSelectorProps) {
        if(prevProps.edition !== this.props.edition) {
            const option = this.state.availableEditions.find((ed) => ed.value === this.props.edition.code);
            if(option) {
                this.setState( { selectedEdition: option });
            }
        }
    }

    editionChanged = (selectedOption: SelectOption) => {
        const edition = FvStore.editions.find((ed) => ed.code === selectedOption.value);
        if(!edition) {
            console.warn(`Couldn't find edition for selection ${selectedOption.value}`);
            return;
        }

        this.setState( { selectedEdition: selectedOption });
        this.props.onEditionSelected(edition);
    }


    render() {
        return (
        <div>
            <label>CHOOSE A VERSION</label>
            <Select
                className='select-style'
                onChange={this.editionChanged}
                options={this.state.availableEditions}
                value={this.state.selectedEdition}
            ></Select>
        </div>
        );
    }
}

export default EditionSelector;
