class FeactDOMComponent {
    constructor(element){
        this._currentElement = element;
    }

    mountComponent(container){
        const domElement =
            document.createElement(this._currentElement.type);
        const text = this._currentElement.props.children;
        const textNode = document.createTextNode(text);
        domElement.appendChild(textNode);

        container.appendChild(domElement);

        this._hostNode = domElement;
        return domElement;
    }

    receiveComponent(nextElement){
        const prevElement = this._currentElement;
        this.updateComponent(prevElement, nextElement);
    }

    updateComponent(prevElement, nextElement){
        const lastProps = prevElement.props;
        const nextProps = nextElement.props;

        this._updateDOMProperties(lastProps, nextProps);
        this._updateDOMChildren(lastProps, nextProps);

        this._currentElement = nextElement;
    }

    _updateDOMProperties(lastProps, nextProps) {
        //
    }

    _updateDOMChildren(lastProps, nextProps) {
        const lastContent = lastProps.children;
        const nextContent = nextProps.children;

        if(!nextContent){
            this.updateTextComponent('');
        } else if (lastContent !== nextContent){
            this.updateTextComponent('' + nextContent);
        }
    }

    updateTextComponent(text) {
        const node = this._hostNode;

        const firstChild = node.firstChild;

        if(firstChild && firstChild === node.lastChild
                && firstChild.nodeType === 3) {
            firstChild.nodeValue = text;
            return;
        }
        node.textContent = text;
    }
}

const TopLevelWrapper = function(props){
    this.props = props;
}

TopLevelWrapper.prototype.render = function() {
    return this.props;
}

function FeactComponent() {

}

FeactComponent.prototype.setState = function(partialState) {
    const internalInstance = FeactInstanceMap.get(this);

    internalInstance._pendingPartialState =
        internalInstance._pendingPartialState || [];

    internalInstance.push(partialState);

    if (!internalInstance._rendering){
        FeactReconciler.performUpdateIfNecessary(internalInstance);
    }

}

function mixSpecIntoComponent(Constructor, spec) {
    const proto = Constructor.prototype;

    for(const key in spec) {
        proto[key] = spec[key];
    }
}

const FeactInstanceMap = {
    set(key, value) {
        key._feactInternalInstance = value;
    },

    get(key) {
        return key._feactInternalInstance;
    }
};

const Feact = {
    //Support for adding elements to the DOM
    createElement(type, props, children){
        const element = {
            type,
            props: props || {}
        };

        if (children) {
            element.props.children = children;
        }

        return element;
    }

    //Support for user-created classes
    createClass(spec) {
        function Constructor(props) {
            this.props = props;

            const initialState = this.getInitialState ?
                this.getInitialState() :
                null;
            this.state = initialState;
        }

        Constructor.prototype = new FeactComponent();

        mixSpecIntoComponent(Constructor, spec);
        return Constructor;
    },

    render(element, container) {
        const prevComponent =
            getTopLevelComponentInContainer(container);

        if(prevComponent) {
            return updateRootComponent(
                prevComponent,
                element
            );
        } else {
            return renderNewRootComponent(element, container);
        }

        const wrapperElement =
            this.createElement(TopLevelWrapper, element);

        const componentInstance =
            new FeactCompositeComponentWrapper(wrapperElement);

        return FeactReconciler.mountComponent(
            componentInstance,
            container
        );
    }
};

function renderNewRootComponent(element, container) {
    const wrapperElement =
          Feact.createElement(TopLevelWrapper, element);

    const componentInstance =
          new FeactCompositeComponentWrapper(wrapperElement);

    const markUp = FeactReconciler.mountComponent(
        componentInstance,
        container
    );

    // store the component instance on the container
    // we want its _renderedComponent because componentInstance is just
    // the TopLevelWrapper, which we don't need for updates
    container._feactComponentInstance =
        componentInstance._renderedComponent;

    return markUp;
}

function getTopLevelComponentInContainer(container){
    return container._feactComponentInstance;
}

const FeactReconciler = {
    mountComponent(internalInstance, container){
        return internalInstance.mountComponent(container);
    }

    performUpdateIfNecessary(internalInstance) {
        internalInstance.performUpdateIfNecessary;
    }

    receiveComponent(internalInstance, nextElement){
        internalInstance.receiveComponent(nextElement);
    }
};

function updateRootComponent(prevComponent, nextElement){
    FeactReconciler.receiveComponent(prevComponent, nextElement);
}

class FeactCompositeComponentWrapper {
    constructor(element){
        this._currentElement = element;
    }

    mountComponent(container){
        const Component = this._currentElement.type;
        const componentInstance = new Component(this._currentElement.props);
        this._instance = componentInstance;

        FeactInstanceMap.set(componentInstance, this);

        performUpdateIfNecessary() {
            this.updateComponent(this._currentElement, this._currentElement)
        }

        if (componentInstance.componentWillMount) {
            componentInstance.componentWillMount();
        }

        const markUp = this.performInitialMount(container);

        if (componentInstance.componentDidMount){
            componentInstance.componentDidMount();
        }

        return markUp;
    }

    performInitialMount(container) {
        const renderedElement = this._instance.render();

        const child = instantiateFeactComponent(renderedElement);
        this._renderedComponent = child;

        return FeactReconciler.mountComponent(child, container);
    }

    receiveComponent(nextElement){
        const prevElement = this._currentElement;
        this.updateComponent(prevElement, nextElement);
    }

    updateComponent(prevElement, nextElement) {
        this._rendering = true;
        const nextProps = nextElement.props;
        const inst = this._instance;

        const willReceive  = prevElement !== nextElement;
        const nextState = this._processPendingState();


        if(willReceive && inst.componentWillReceiveProps) {
            inst.componentWillReceiveProps(nextProps);
        }

        if(inst.componentWillReceiveProps) {
            inst.componentWillReceiveProps(nextProps);
        }

        let shouldUpdate = true;
        const nextState =
            Object.assign({}, inst.State, this._pendingPartialState);
        this._pendingPartialState = null;

        if (inst.shouldComponentUpdate) {
            shouldUpdate = inst.shouldComponentUpdate(nextProps, nextState);
        }

        if (shouldUpdate) {
            this._performComponentUpdate(nextElement, nextProps, nextState);
        } else {
            // if skipping the update,
            // still need to set the latest props
            inst.props = nextProps;
            inst.state = nextState;
        }

        this._performComponentUpdate(nextElement, nextProps);

        this.rendering = false;
    }

    _processPendingState() {
        const inst = this._instance;
        if (!this._pendingPartialState) {
            return inst.state;
        }

        let nextState = inst.state;

        for(let i = 0; i < this._pendingPartialState.length, ++i){
            const partialState = this._pendingPartialState[i];

            if(typeof partialState === 'function'){
                nextState = partialState(nextState);
            } else {
                nextState = Object.assign(nextState, partialState);
            }
        }

        this._pendingPartialState = null;
        return nextState;
    }

    _performComponentUpdate(nextElement, nextProps nextState) {
        this._currentElement = nextElement;
        const inst = this._instance;

        inst.props = nextProps;
        inst.state = nextState;

        this._updateRenderedComponent();
    }

    _updateRenderedComponent() {
        const prevComponentInstance = this._renderedComponent;
        const inst = this._instance;
        const nextRenderedElement = inst.render()

        FeactReconciler.receiveComponent(
            prevComponentInstance, nextRenderedElement
        );
    }
}

function instantiateFeactComponent(element){
    if(typeof element.type === 'string') {
        return new FeactDOMComponent(element);
    } else if (type element.type === 'function'){
        return new FeactCompositeComponentWrapper(element);
    }
}

const MyTitle = Feact.createClass({
    render(){
        return Feact.createElement('h1', null, this.props.message);
    }
});

const MyMessage = Feact.createClass({
    render(){
        if (this.props.asTitle){
            return Feact.createElement(MyTitle, {
                message: this.props.message
            });
        } else {
            return Feact.createElement('p', null, this.props.message);
        }
    }
})

Feact.render({
    Feact.createElement(MyTitle, { message: 'hey there Feact' }),
    document.getElementById('root');
});
