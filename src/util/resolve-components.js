/* @flow */

import { _Vue } from '../install'
import { warn, isError } from './warn'

export function resolveAsyncComponents (matched: Array<RouteRecord>): Function {
    return (to, from, next) => {
        let hasAsync = false
        let pending = 0
        let error = null

        flatMapComponents(matched, (def, _, match, key) => {
            // if it's a function and doesn't have cid attached,
            // assume it's an async component resolve function.
            // we are not using Vue's default async resolving mechanism because
            // we want to halt the navigation until the incoming component has been
            // resolved.
            // 判断是否是异步组件
            if (typeof def === 'function' && def.cid === undefined) {
                // 成功回调
                // once函数确保异步组件只加载一次
                hasAsync = true
                pending++

                const resolve = once(resolvedDef => {
                    if (isESModule(resolvedDef)) {
                        resolvedDef = resolvedDef.default
                    }
                    // save resolved on async factory in case it's used elsewhere
                    /**
                     * 判断是否是构造函数
                     * 不是则通过Vue来生成组件构造函数
                     */
                    def.resolved = typeof resolvedDef === 'function'
                        ? resolvedDef
                        : _Vue.extend(resolvedDef)
                    // 赋值组件，如果组件全部解析完毕，继续下一步
                    match.components[key] = resolvedDef
                    pending--
                    if (pending <= 0) {
                        next()
                    }
                })

                // 失败回调
                const reject = once(reason => {
                    const msg = `Failed to resolve async component ${key}: ${reason}`
                    process.env.NODE_ENV !== 'production' && warn(false, msg)
                    if (!error) {
                        error = isError(reason)
                            ? reason
                            : new Error(msg)
                        next(error)
                    }
                })

                let res
                try {
                    // 下载完成执行回调
                    res = def(resolve, reject)
                } catch (e) {
                    reject(e)
                }
                if (res) {
                    if (typeof res.then === 'function') {
                        res.then(resolve, reject)
                    } else {
                        // new syntax in Vue 2.3
                        const comp = res.component
                        if (comp && typeof comp.then === 'function') {
                            comp.then(resolve, reject)
                        }
                    }
                }
            }
        })

        // 不是异步组件直接下一步
        if (!hasAsync) next()
    }
}

export function flatMapComponents (matched: Array<RouteRecord>, fn: Function): Array<?Function> {
    return flatten(matched.map(m => {
        //  将组件中的对象传入回调函数中，获得钩子函数数组
        return Object.keys(m.components).map(key => fn(m.components[key],
            m.instances[key],
            m, key))
    }))
}

export function flatten (arr: Array<any>): Array<any> {
    return Array.prototype.concat.apply([], arr)
}

const hasSymbol =
    typeof Symbol === 'function' &&
    typeof Symbol.toStringTag === 'symbol'

function isESModule (obj) {
    return obj.__esModule || (hasSymbol && obj[Symbol.toStringTag] === 'Module')
}

// in Webpack 2, require.ensure now also returns a Promise
// so the resolve/reject functions may get called an extra time
// if the user uses an arrow function shorthand that happens to
// return that Promise.
function once (fn) {
    let called = false
    return function (...args) {
        if (called) return
        called = true
        return fn.apply(this, args)
    }
}
