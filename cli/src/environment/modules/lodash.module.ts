import * as _ from "lodash"
import { defineModule } from "../build/defineModule"

const lodash = {
  /**
   * The entire lodash library.
   * @example _.map([1, 2, 3], n => n * 2)
   * @example _.get(obj, 'nested.path', defaultValue)
   */
  _,

  help(): void {
    console.log(`
# lodash

Lodash utility library for common programming tasks.

## API

Lodash is exposed as the global \`_\` object with hundreds of utilities.
Common utilities are also available as top-level globals.

\`\`\`ts
declare global {
  // Main lodash object
  const _: typeof import('lodash')

  // Array utilities
  function chunk<T>(array: T[], size: number): T[][]
  function compact<T>(array: (T | null | undefined | false | 0 | '')[]): T[]
  function flatten<T>(array: T[][]): T[]
  function uniq<T>(array: T[]): T[]
  function intersection<T>(...arrays: T[][]): T[]
  function difference<T>(array: T[], ...values: T[][]): T[]

  // Object utilities
  function merge<T>(object: T, ...sources: any[]): T
  function pick<T, K extends keyof T>(object: T, ...keys: K[]): Pick<T, K>
  function omit<T, K extends keyof T>(object: T, ...keys: K[]): Omit<T, K>
  function get<T>(object: any, path: string | string[], defaultValue?: T): T
  function set<T>(object: any, path: string | string[], value: any): T
  function has(object: any, path: string | string[]): boolean
  function keys<T>(object: T): (keyof T)[]
  function values<T>(object: T): T[keyof T][]

  // Collection utilities
  function map<T, U>(collection: T[], iteratee: (value: T, index: number, array: T[]) => U): U[]
  function filter<T>(collection: T[], predicate: (value: T, index: number, array: T[]) => boolean): T[]
  function find<T>(collection: T[], predicate: (value: T, index: number, array: T[]) => boolean): T | undefined
  function groupBy<T>(collection: T[], iteratee: (value: T) => string): Record<string, T[]>
  function sortBy<T>(collection: T[], iteratees: ((value: T) => any)[]): T[]
  function reduce<T, U>(collection: T[], iteratee: (acc: U, value: T, index: number, array: T[]) => U, accumulator: U): U

  // Function utilities
  function debounce<T extends (...args: any[]) => any>(func: T, wait: number): T
  function throttle<T extends (...args: any[]) => any>(func: T, wait: number): T
  function once<T extends (...args: any[]) => any>(func: T): T
  function memoize<T extends (...args: any[]) => any>(func: T): T

  // String utilities
  function camelCase(string: string): string
  function kebabCase(string: string): string
  function snakeCase(string: string): string
  function capitalize(string: string): string
  function upperFirst(string: string): string
  function lowerFirst(string: string): string

  // Type checking
  function isArray(value: any): value is any[]
  function isObject(value: any): value is object
  function isString(value: any): value is string
  function isNumber(value: any): value is number
  function isBoolean(value: any): value is boolean
  function isFunction(value: any): value is Function
  function isNull(value: any): value is null
  function isUndefined(value: any): value is undefined
  function isEmpty(value: any): boolean
}
\`\`\`

## Examples

\`\`\`ts
// Array operations
const chunks = chunk([1, 2, 3, 4, 5], 2)  // [[1, 2], [3, 4], [5]]
const unique = uniq([1, 2, 2, 3, 3, 4])   // [1, 2, 3, 4]

// Object operations
const data = { a: { b: { c: 42 } } }
const value = get(data, 'a.b.c')          // 42
const subset = pick(data, ['a'])          // { a: { b: { c: 42 } } }

// Collection operations
const doubled = map([1, 2, 3], n => n * 2)        // [2, 4, 6]
const grouped = groupBy(['one', 'two', 'three'], 'length')  // { '3': ['one', 'two'], '5': ['three'] }

// String operations
camelCase('hello-world')   // 'helloWorld'
kebabCase('HelloWorld')    // 'hello-world'
snakeCase('helloWorld')    // 'hello_world'

// Use full lodash via _
_.range(5)                 // [0, 1, 2, 3, 4]
_.cloneDeep(obj)           // deep clone
_.isEqual(a, b)            // deep equality check
\`\`\`
`.trim())
  },
}

export default defineModule({
  name: "lodash",
  description: "Utility library for arrays, objects, strings, and functions",
  jsdoc: "declare const _: typeof import('lodash'); declare function chunk<T>(array: T[], size: number): T[][]; declare function compact<T>(array: (T | null | undefined | false | 0 | '')[]): T[]; declare function flatten<T>(array: T[][]): T[]; declare function uniq<T>(array: T[]): T[]; declare function merge<T>(object: T, ...sources: any[]): T; declare function pick<T, K extends keyof T>(object: T, ...keys: K[]): Pick<T, K>; declare function omit<T, K extends keyof T>(object: T, ...keys: K[]): Omit<T, K>; declare function get<T>(object: any, path: string | string[], defaultValue?: T): T; declare function has(object: any, path: string | string[]): boolean; declare function keys<T>(object: T): (keyof T)[]; declare function values<T>(object: T): T[keyof T][]; declare function groupBy<T>(collection: T[], iteratee: (value: T) => string): Record<string, T[]>; declare function sortBy<T>(collection: T[], iteratees: ((value: T) => any)[]): T[]; declare function debounce<T extends (...args: any[]) => any>(func: T, wait: number): T; declare function throttle<T extends (...args: any[]) => any>(func: T, wait: number): T; declare function camelCase(string: string): string; declare function kebabCase(string: string): string; declare function snakeCase(string: string): string; declare function capitalize(string: string): string; declare function isArray(value: any): value is any[]; declare function isObject(value: any): value is object; declare function isString(value: any): value is string; declare function isNumber(value: any): value is number; declare function isEmpty(value: any): boolean",
  api: lodash,
  globals: {
    _,
    // Array utilities
    chunk: _.chunk,
    compact: _.compact,
    flatten: _.flatten,
    uniq: _.uniq,
    intersection: _.intersection,
    difference: _.difference,
    // Object utilities
    merge: _.merge,
    pick: _.pick,
    omit: _.omit,
    get: _.get,
    set: _.set,
    has: _.has,
    keys: _.keys,
    values: _.values,
    // Collection utilities
    map: _.map,
    filter: _.filter,
    find: _.find,
    groupBy: _.groupBy,
    sortBy: _.sortBy,
    reduce: _.reduce,
    // Function utilities
    debounce: _.debounce,
    throttle: _.throttle,
    once: _.once,
    memoize: _.memoize,
    // String utilities
    camelCase: _.camelCase,
    kebabCase: _.kebabCase,
    snakeCase: _.snakeCase,
    capitalize: _.capitalize,
    upperFirst: _.upperFirst,
    lowerFirst: _.lowerFirst,
    // Type checking
    isArray: _.isArray,
    isObject: _.isObject,
    isString: _.isString,
    isNumber: _.isNumber,
    isBoolean: _.isBoolean,
    isFunction: _.isFunction,
    isNull: _.isNull,
    isUndefined: _.isUndefined,
    isEmpty: _.isEmpty,
  }
})
