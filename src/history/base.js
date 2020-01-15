/* @flow */

import { _Vue } from '../install'
import type Router from '../index'
import { inBrowser } from '../util/dom'
import { runQueue } from '../util/async'
import { warn, isError, isExtendedError } from '../util/warn'
import { START, isSameRoute } from '../util/route'
import {
    flatten,
    flatMapComponents,
    resolveAsyncComponents
} from '../util/resolve-components'
import { NavigationDuplicated } from './errors'

export class History {
    router: Router
    base: string
    current: Route
    pending: ?Route
    cb: (r: Route) => void
    ready: boolean
    readyCbs: Array<Function>
    readyErrorCbs: Array<Function>
    errorCbs: Array<Function>

    // implemented by sub-classes
    +go: (n: number) => void
    +push: (loc: RawLocation) => void
    +replace: (loc: RawLocation) => void
    +ensureURL: (push?: boolean) => void
    +getCurrentLocation: () => string

    constructor (router: Router, base: ?string) {
        this.router = router
        this.base = normalizeBase(base)
        // start with a route object that stands for "nowhere"
        this.current = START
        this.pending = null
        this.ready = false
        this.readyCbs = []
        this.readyErrorCbs = []
        this.errorCbs = []
    }

    listen (cb: Function) {
        this.cb = cb
    }

    onReady (cb: Function, errorCb: ?Function) {
        if (this.ready) {
            cb()
        } else {
            this.readyCbs.push(cb)
            if (errorCb) {
                this.readyErrorCbs.push(errorCb)
            }
        }
    }

    onError (errorCb: Function) {
        this.errorCbs.push(errorCb)
    }

    /**
     * vue-router路由跳转的核心逻辑
     * 执行所有的路由钩子
     * 执行所有的路由钩子
     * @param location: 跳转的路由信息
     * @param onComplete: 成功回调
     * @param onAbort: 失败回调
     */
    transitionTo (location: RawLocation, onComplete?: Function, onAbort?: Function) {
        /**
         * this是history路由实例（HashHistory | HTML5History）
         * this.router是vueRouter实例
         * match方法会根据当前的location + 之前生成的路由映射表（nameMap,pathMap），生成$route对象（src/create-matcher.js:31）
         * current是切换前的$route对象
         */

        // 获取路由信息
        const route = this.router.match(location, this.current)
        // 触发路由钩子
        this.confirmTransition(route,
            // 切换成功回调
            () => {
                // 确认导航成功，更新视图以及执行afterEach钩子
                this.updateRoute(route)
                //  执行transitionTo成功的回调(src/index.js:116)
                onComplete && onComplete(route)
                // 更新url
                this.ensureURL()

                // fire ready cbs once
                // 只执行一次ready回调
                if (!this.ready) {
                    this.ready = true
                    this.readyCbs.forEach(cb => {
                        cb(route)
                    })
                }
            },
            // 切换失败回调
            err => {
                if (onAbort) {
                    onAbort(err)
                }
                if (err && !this.ready) {
                    this.ready = true
                    this.readyErrorCbs.forEach(cb => {
                        cb(err)
                    })
                }
            })
    }

    /**
     * transitionTo的核心，执行一系列路由钩子，传入route对象，成功回调和失败回调
     * @param route
     * @param onComplete
     * @param onAbort
     */
    confirmTransition (route: Route, onComplete: Function, onAbort?: Function) {
        // 切换前的route对象
        const current = this.current
        // 中断跳转路由函数
        const abort = err => {
            // after merging https://github.com/vuejs/vue-router/pull/2771 we
            // When the user navigates through history through back/forward buttons
            // we do not want to throw the error. We only throw it if directly calling
            // push/replace. That's why it's not included in isError
            if (!isExtendedError(NavigationDuplicated, err) && isError(err)) {
                if (this.errorCbs.length) {
                    this.errorCbs.forEach(cb => {
                        cb(err)
                    })
                } else {
                    warn(false, 'uncaught error during route navigation:')
                    console.error(err)
                }
            }
            onAbort && onAbort(err)
        }
        // 如果是相同的路由就不做跳转
        if (isSameRoute(route, current) && route.matched.length === current.matched.length) {
            this.ensureURL()
            return abort(new NavigationDuplicated(route))
        }

        // 计算出当前路由和跳转路由在路径上的相同点不同点（路由记录），来执行不同的导航守卫
        const { updated, deactivated, activated } = resolveQueue(this.current.matched, route.matched)

        /**
         * queue是NavigationGuard组成的数组， NavigationGuard是路由守卫的函数，传入to,from,next3个参数
         * @type {Array<unknown>}
         */
        const queue: Array<?NavigationGuard> = [].concat(
            // in-component leave guards
            // 失活组件钩子, 返回离开组件的 beforeRouteLeave 钩子函数（数组，子 => 父）
            extractLeaveGuards(deactivated),
            // global before hooks
            // 返回路由实例（全局）的 beforeEach 钩子函数（数组） （src/index.js:128）
            this.router.beforeHooks,
            // in-component update hooks
            // 返回当前组件的 beforeRouteUpdate 钩子函数（数组，父 => 子）
            extractUpdateHooks(updated),
            // in-config enter guards
            // 返回当前组件的 beforeEnter 钩子函数（数组）
            activated.map(m => m.beforeEnter),
            // async components
            // 解析异步组件(同样会返回一个导航守卫函数的签名，但是用不到 to,from 这 2 个参数)
            resolveAsyncComponents(activated))

        // 保存路由
        this.pending = route

        /**
         * runQueue每次遍历都会执行iterator函数并且传入当前的路由守卫函数进行解析，解析后会执行next回调（即step+1）
         * 我们知道，当在路由守卫中如果没有执行 next 函数，路由将无法跳转，原因是因为没有去执行 hook 的第三个回调函数，也就不会执行 iterator 的第三个参数 next，最终导致不会通知 runQueue 继续往下遍历
         * 另外当我们给 next 函数传入另一个路径时，会取消原来的导航，取而代之跳转到指定的路径，原因是因为满足上图的 true 逻辑，执行 abort 函数取消导航，随后会调用 push/replace 将路由重新跳转到指定的页面
         * 最后回到之前异步路由中提到的那个 next 函数，当所有的异步路由都被解析完成后，才会执行 next 函数继续遍历 queue 数组的下个元素，一旦有某个路由没有被解析完成，vue-router 就会一直等待直到接受到为止，然后才会去触发之后的逻辑
         * @param hook
         * @param next: 其中迭代器的参数 next 即 runQueue 中的 step 函数
         */
        const iterator = (hook: NavigationGuard, next) => {
            // 路由不相等就不跳转路由
            if (this.pending !== route) {
                return abort()
            }
            try {
                /**
                 * 执行某个生命周期中的导航守卫
                 */
                hook(route, current, (to: any) => {
                    // 只有执行了钩子函数中的next,才会继续执行下一个钩子函数，否则会停止跳转
                    // 以下逻辑是在判断next()中的传参
                    if (to === false || isError(to)) {
                        // next(false) -> abort navigation, ensure current URL
                        // 如果传入的是next(false)会中断导航，并且会重置到form的路由
                        this.ensureURL(true)
                        abort(to)
                    } else if (typeof to === 'string' || (typeof to === 'object' && (typeof to.path === 'string' || typeof to.name === 'string'))) {
                        // 跳转到指定路由
                        // next('/') or next({ path: '/' }) -> redirect 重定向
                        abort() // 取消导航并且执行push/replace跳转到指定路由
                        if (typeof to === 'object' && to.replace) {
                            this.replace(to)
                        } else {
                            this.push(to)
                        }
                    } else {
                        // confirm transition and pass on the value
                        // 如果next没有参数则直接执行runQueue next,即解析queue的下个元素
                        next(to)
                    }
                })
            } catch (e) {
                abort(e)
            }
        }

        /**
         * 等到队列中所有的组件（懒加载的组件）都解析完毕后，就会执行第三个参数回调
         * 即为什么beforeRouteEnter钩子需要在next回调中执行的原因
         */
        runQueue(queue, iterator,
            // 队列遍历结束后，执行异步组件的回调（此时懒加载组件以及被解析完毕）
            () => {
                const postEnterCbs = [] // 保存beforeRouterEnter的next回调
                const isValid = () => this.current === route
                // wait until async components are resolved before
                // extracting in-component enter guards
                // 返回当前组件的 beforeRouteEnter 钩子函数（数组）
                const enterGuards = extractEnterGuards(activated, postEnterCbs, isValid)
                // 将 beforeResolve 钩子放到 beforeRouteEnter 钩子数组的后面依次执行
                const queue = enterGuards.concat(this.router.resolveHooks)
                // 遍历队列执行 beforeRouteEnter 和 beforeResolve 钩子
                runQueue(queue, iterator, () => {
                    // 跳转完成
                    if (this.pending !== route) {
                        return abort()
                    }
                    this.pending = null
                    // 确认导航，执行onComplete回调，包含：$nextTick 后更新视图，执行afterEach钩子（74）
                    onComplete(route)
                    if (this.router.app) {
                        /** 在nextTick后执行 postEnterCbs 数组即 beforeRouteEnter 的next方法的参数（函数）**/
                        /** 因为此时 nextTick 队列中存在一个 render watcher 所以先执行 render watcher 更新视图，再执行 beforeRouteEnter 的回调**/
                        // 最终
                        // 因此 beforeRouteEnter 需要通过回调传入this的值
                        this.router.app.$nextTick(() => {
                            postEnterCbs.forEach(cb => {
                                cb()
                            })
                        })
                    }
                })
            })
    }

    // 确认导航成功，执行afterEach钩子
    updateRoute (route: Route) {
        const prev = this.current
        this.current = route
        /** 执行回调给route赋值，随即触发视图更新（src/index.js:125）*/
        this.cb && this.cb(route)
        this.router.afterHooks.forEach(hook => {
            hook && hook(route, prev)
        })
    }
}

function normalizeBase (base: ?string): string {
    if (!base) {
        if (inBrowser) {
            // respect <base> tag
            const baseEl = document.querySelector('base')
            base = (baseEl && baseEl.getAttribute('href')) || '/'
            // strip full URL origin
            base = base.replace(/^https?:\/\/[^\/]+/, '')
        } else {
            base = '/'
        }
    }
    // make sure there's the starting slash
    if (base.charAt(0) !== '/') {
        base = '/' + base
    }
    // remove trailing slash
    return base.replace(/\/$/, '')
}

/**
 * 计算出当前路由和跳转路由在路径上的相同点不同点，来执行不同的导航守卫
 * @param current: 当前路由
 * @param next: 是跳转路由
 * @returns {{updated: Array<T>, deactivated: Array<T>, activated: Array<T>}}
 */
function resolveQueue (current: Array<RouteRecord>, next: Array<RouteRecord>): { updated: Array<RouteRecord>, activated: Array<RouteRecord>, deactivated: Array<RouteRecord> } {
    let i
    const max = Math.max(current.length, next.length)
    // i 为两个 current,next 中的分岔点
    // i 前的两个数组的对应的路由记录是相同的
    // i 后的不同
    // 之所以能够使用这种算法来区分相同/不同的路由记录
    // 是因为路由记录是由 routerConfig 转换过来的，而 routerConfig 是一棵树形结构
    for (i = 0; i < max; i++) {
        // 当前路由路径和跳转路由路径不同时跳出遍历
        if (current[i] !== next[i]) {
            break
        }
    }
    return {
        // 可复用的组件对应路由
        updated: next.slice(0, i),
        // 需要渲染的组件对应路由
        activated: next.slice(i),
        // 失活的组件对应路由
        deactivated: current.slice(i)
    }
}

/**
 * 根据records数组，返回当前这个组件对应的某个生命周期的路由守卫（数组）
 * @param records: 删除的路由记录
 * @param name: 即最终触发路由守卫的名称
 * @param bind
 * @param reverse
 * @returns {Array<*>}
 */
function extractGuards (records: Array<RouteRecord>, name: string, bind: Function, reverse?: boolean): Array<?Function> {
    // 扁平化 + 数组Map
    const guards = flatMapComponents(records, (def, instance, match, key) => {
        // 通过name（路由守卫的名字），获取到当前组件对应的路由守卫函数
        const guard = extractGuard(def, name)
        if (guard) {
            // 给每个钩子函数添加上下文对象为组件自身
            return Array.isArray(guard)
                // 绑定上下文this，传入当前路由守卫函数，实例，record和视图名字
                ? guard.map(guard => bind(guard, instance, match, key))
                : bind(guard, instance, match, key)
        }
    })

    /**
     *  倒序数组，之前是父=>子，如果reverse为true则为子 => 父
     *  对于离开某个路由时，由于子路由需要先离开所以要倒序数组，让子组件先触发beforeLeave钩子
     */
    return flatten(reverse ? guards.reverse() : guards)
}

/**
 *
 * @param def
 * @param key: 路由钩子的name
 * @returns {*}
 */
function extractGuard (def: Object | Function, key: string): NavigationGuard | Array<NavigationGuard> {
    //  // 非懒加载
    if (typeof def !== 'function') {
        // extend now so that global mixins are applied.
        // 将配置项变成组件构造器
        def = _Vue.extend(def)
    }
    // 返回组件构造器options配置项中对应的路由钩子函数
    return def.options[key]
}

// 组件内的路由导航守卫 --->beforeRouteLeave
/**
 * 层封装最终会执行通用函数 extractGuards
 * @param deactivated
 * @returns {Array}
 */
function extractLeaveGuards (deactivated: Array<RouteRecord>): Array<?Function> {
    // 传入需要执行的钩子函数
    return extractGuards(deactivated, 'beforeRouteLeave', bindGuard, true)
}

// 组件内的路由导航守卫 --->beforeRouteUpdate
function extractUpdateHooks (updated: Array<RouteRecord>): Array<?Function> {
    return extractGuards(updated, 'beforeRouteUpdate', bindGuard)
}

/**
 *
 * @param guard
 * @param instance
 * @returns {function(): *}
 */
function bindGuard (guard: NavigationGuard, instance: ?_Vue): ?NavigationGuard {
    if (instance) {
        return function boundRouteGuard () {
            return guard.apply(instance, arguments)
        }
    }
}

// 组件内的路由导航守卫 --->beforeRouteEnter
function extractEnterGuards (activated: Array<RouteRecord>,
    cbs: Array<Function>,
    isValid: () => boolean): Array<?Function> {
    return extractGuards(activated,
        'beforeRouteEnter',
        (guard, _, match, key) => {
            return bindEnterGuard(guard, match, key, cbs, isValid)
        })
}

/**
 *
 * @param guard
 * @param match
 * @param key
 * @param cbs
 * @param isValid
 * @returns {function(*=, *=, *): *}
 */
function bindEnterGuard (guard: NavigationGuard,
    match: RouteRecord,
    key: string,
    cbs: Array<Function>,
    isValid: () => boolean): NavigationGuard {
    return function routeEnterGuard (to, from, next) {
        // 将用户定义在beforeRouteEnter中的next函数，作为第三个参数传入guard中
        return guard(to, from, /* cb是一个函数，作为回调函数的参数*/ cb => {
            /** 当cb是一个函数，即next中传入了一个回调函数时，会将它放到回调数组中，在nextTick后执行它
             * 因为这个时候组件虽然被解析成功了，但是触发视图更新的逻辑还未执行（没有给route赋值），所以回调需要在nextTick后才能拿到vm实例
            */
            if (typeof cb === 'function') {
                cbs.push(() => {
                    // #750
                    // if a router-view is wrapped with an out-in transition,
                    // the instance may not have been registered at this time.
                    // we will need to poll for registration until current route
                    // is no longer valid.
                    // 如果存在特殊情况（transition） 会延迟到下个宏任务执行，一般不会
                    poll(cb, match.instances, key, isValid)
                })
            }
            next(cb)
        })
    }
}

/**
 *
 * @param cb
 * @param instances
 * @param key
 * @param isValid
 */
function poll (cb: any, // somehow flow cannot infer this is a function
    instances: Object,
    key: string,
    isValid: () => boolean) {
    if (instances[key] && !instances[key]._isBeingDestroyed) {
        // 只有当组件被生成后，执行registerRouteInstance给matched对象赋值了当前组件的实例，instances[key]才会获得组件实例
        // 调用cb并且传入vm实例，所以在next的参数cb中中可以拿到参数vm
        cb(instances[key])
    } else if (isValid()) {
        setTimeout(() => {
            poll(cb, instances, key, isValid)
        }, 16)
    }
}
