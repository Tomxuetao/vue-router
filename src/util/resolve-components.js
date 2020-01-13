/* @flow */

import { _Vue } from '../install'
import { warn, isError } from './warn'

/**
 * 函数最终会返回一个函数，并且符合路由守卫的函数签名（这里 vue-router 可能只是为了保证返回函数的一致性，实质上在这个函数中，并不会用到 to,from 这2个参数）
 *
 * 这个函数只是被定义了，并没有执行，但是我们可以通过函数体观察它是如何加载异步路由的。同样通过 flatMapComponents 遍历新增的路由记录，每次遍历都执行第二个回调函数
 *
 * 在回调函数里，会定义一个 resolve 函数，当异步组件加载完成后，会通过 then 的形式解析 promise，最终会调用 resolve 函数并传入异步组件的配置项作为参数， resolve 函数接收到组件配置项后会像 Vue 中一样将配置项转为构造器 ，同时将值赋值给当前路由记录的 componts 属性中(key 属性默认为 default)
 * 另外 resolveAsyncComponents 函数会通过闭包保存一个 pending 变量，代表接收的异步组件数量，在 flatMapComponents 遍历的过程中，每次会将 pending 加一，而当异步组件被解析完毕后再将 pending 减一，也就是说，当 pengding 为 0 时，代表异步组件全部解析完成， 随即执行 next 方法，next 方法是 vue-router 控制整个路由导航顺序的核心方法
 * @param matched
 * @returns {function(...[*]=)}
 */
export function resolveAsyncComponents (matched: Array<RouteRecord>): Function {
    return (to, from, next) => {
        let hasAsync = false
        let pending = 0
        let error = null

        flatMapComponents(matched,
            /**
             *
             * @param def: 视图名对应的组件配置项（因为 vue-router 支持命名视图所以可能会有多个视图名，大部分情况为 default，及使用默认视图），当是异步路由时，def为异步返回路由的函数
             * @param _: 组件实例
             * @param match: 当前遍历到的路由记录
             * @param key: 视图名
             */
            (def, _, match, key) => {
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

/**
 * 遍历 records 数组，每次执行第二个回调函数，类似数组的 map 方法
 * @param matched
 * @param fn
 * @returns {Array<*>}
 */
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
