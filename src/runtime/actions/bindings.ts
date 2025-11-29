import type { CliNode } from '../types.js';

type Getter<T> = () => T;
type Setter<T> = (value: T) => void;

export interface ValueBindingConfig<T = unknown> {
    get: Getter<T>;
    set?: Setter<T>;
}

export interface CheckedBindingConfig {
    get: Getter<boolean>;
    set?: Setter<boolean>;
}

export interface SelectBindingConfig<T = unknown> {
    get: Getter<T>;
    set?: Setter<T>;
}

export function applyValueBinding<T = unknown>(node: CliNode, config: ValueBindingConfig<T>): void {
    const setter = config.set ?? config.get;
    // Store accepts unknown; the binding creator is responsible for type safety
    node.__setValue = (value: unknown) => setter(value as T);
    node.value = config.get();
    node.__rawValue = String(node.value ?? '');
}

export function applyCheckedBinding(node: CliNode, config: CheckedBindingConfig): void {
    const setter = config.set ?? config.get;
    node.__setChecked = (value: boolean) => setter(value);
    node.checked = !!config.get();
}

export function applySelectBinding<T = unknown>(node: CliNode, config: SelectBindingConfig<T>): void {
    const setter = config.set ?? config.get;
    // Store accepts unknown; the binding creator is responsible for type safety
    node.__setValue = (value: unknown) => setter(value as T);
    node.value = config.get();
}

export function valueBindingAction<T = unknown>(node: CliNode, config: ValueBindingConfig<T>) {
    applyValueBinding(node, config);
    return {
        update(next: ValueBindingConfig<T>) {
            applyValueBinding(node, next);
        },
        destroy() {
            delete node.__setValue;
        },
    };
}

export function checkedBindingAction(node: CliNode, config: CheckedBindingConfig) {
    applyCheckedBinding(node, config);
    return {
        update(next: CheckedBindingConfig) {
            applyCheckedBinding(node, next);
        },
        destroy() {
            delete node.__setChecked;
        },
    };
}

export function selectValueBindingAction<T = unknown>(node: CliNode, config: SelectBindingConfig<T>) {
    applySelectBinding(node, config);
    return {
        update(next: SelectBindingConfig<T>) {
            applySelectBinding(node, next);
        },
        destroy() {
            delete node.__setValue;
        },
    };
}

