import * as _ from "lodash"
import { defineModule } from "../build/defineModule"

const lodash = {
  /**
   * The entire lodash library.
   * @example _.map([1, 2, 3], n => n * 2)
   * @example _.get(obj, 'nested.path', defaultValue)
   */
  _,
}

export default defineModule({
  name: "lodash",
  description: "Utility library for arrays, objects, strings, and functions",
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
