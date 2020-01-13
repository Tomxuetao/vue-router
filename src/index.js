/* @flow */

import { install } from './install'
import { START } from './util/route'
import { assert } from './util/warn'
import { inBrowser } from './util/dom'
import { cleanPath } from './util/path'
import { createMatcher } from './create-matcher'
import { normalizeLocation } from './util/location'
import { supportsPushState } from './util/push-state'

import { HashHistory } from './history/hash'
import { HTML5History } from './history/html5'
import { AbstractHistory } from './history/abstract'

import type { Matcher } from './create-matcher'

/**
 * 在实例化 VueRouter 的过程中，核心是创建一个路由匹配对象，并且根据 mode 来采取不同的路由方式。
 */
export default class VueRouter {
    static install: () => void;
    static version: string;

    // Vue install，配置了router的Vue根实例
    app: any;
    apps: Array<any>;
    ready: boolean;
    readyCbs: Array<Function>;
    options: RouterOptions;
    // 路由使用的模式
    mode: string;
    history: HashHistory | HTML5History | AbstractHistory;
    matcher: Matcher;
    /**
     * 当浏览器不支持 history.pushState 控制路由是否应该回退到 hash 模式。默认值为 true。在 IE9 中，设置为 false 会使得每个 router-link 导航都触发整页刷新。
     * 它可用于工作在 IE9 下的服务端渲染应用，因为一个 hash 模式的 URL 并不支持服务端渲染。
     */
    fallback: boolean;
    beforeHooks: Array<?NavigationGuard>;
    resolveHooks: Array<?NavigationGuard>;
    afterHooks: Array<?AfterNavigationHook>;

    /**
     * options = {
     *      routes?: Array<RouteConfig>; // 类型: Array<RouteConfig>
     *      mode?: string; // 默认值: "hash" (浏览器环境) | "abstract" (Node.js 环境) 可选值: "hash" | "history" | "abstract"
     *      fallback?: boolean; // 当浏览器不支持 history.pushState 控制路由是否应该回退到 hash 模式。默认值为 true。在 IE9 中，设置为 false 会使得每个 router-link 导航都触发整页刷新。它可用于工作在 IE9 下的服务端渲染应用，因为一个 hash 模式的 URL 并不支持服务端渲染
     *      base?: string;  // 应用的基路径
     *      linkActiveClass?: string; // 全局配置 <router-link> 默认的激活的 class
     *      linkExactActiveClass?: string; // 全局配置 <router-link> 默认的精确激活的 class
     *      parseQuery?: (query: string) => Object; // 提供自定义查询字符串的解析/反解析函数。覆盖默认行为。
     *      stringifyQuery?: (query: Object) => string; // 提供自定义查询字符串的解析/反解析函数。覆盖默认行为。
     *      scrollBehavior?: (to: Route,from: Route,savedPosition: ?Position) => PositionResult | Promise<PositionResult>; // 滚动行为，使用前端路由，当切换到新路由时，想要页面滚到顶部，或者是保持原先的滚动位置，就像重新加载页面那样。
     * }
     * @param options
     */
    constructor (options: RouterOptions = {}) {
        this.app = null
        this.apps = []
        this.options = options
        this.beforeHooks = []
        this.resolveHooks = []
        this.afterHooks = []

        /**
         * 给实例创建一个 matcher 对象，matcher 对象同时含有 match 和 addRoutes 两个方法
         * @type {Matcher}
         */
        this.matcher = createMatcher(options.routes || [], this)

        // 根据mode采取不同路由方法
        let mode = options.mode || 'hash'

        // 选择了history模式但是不支持会回退到hash路由
        this.fallback = mode === 'history' && !supportsPushState && options.fallback !== false

        // 降级为hash模式（显示声明为hash模式 | 不支持history模式 | 要求降级fallback:true）
        if (this.fallback) {
            mode = 'hash'
        }
        if (!inBrowser) {
            mode = 'abstract'
        }
        this.mode = mode

        // 根据mode来新建不同的实例（HTML5History | HashHistory | AbstractHistory）给history属性
        // 根据 history 的类型，采取不同的方式切换路由（108）
        switch (mode) {
        case 'history':
            this.history = new HTML5History(this, options.base)
            break
        case 'hash':
            this.history = new HashHistory(this, options.base, this.fallback)
            break
        case 'abstract':
            this.history = new AbstractHistory(this, options.base)
            break
        default:
            if (process.env.NODE_ENV !== 'production') {
                assert(false, `invalid mode: ${mode}`)
            }
        }
    }

    // 匹配路由信息
    match (raw: RawLocation, current?: Route, redirectedFrom?: Location): Route {
        // 最终执行实例的 matcher 属性的 match 方法（src/create-matcher.js:31）
        return this.matcher.match(raw, current, redirectedFrom)
    }

    // 获取当前路由
    get currentRoute (): ?Route {
        return this.history && this.history.current
    }

    /**
     * 初始化router实例
     * 而实例化和初始化 vue-router 是有区别的，
     * 实例化指的是通过 new Router 生成 vue-router 实例，
     * 初始化可以理解为进行全局第一次的路由跳转时，让 vue-router 实例和组件建立联系，使得路由能够接管组件
     * @param app
     */
    init (app: any /* Vue component instance */) {
        process.env.NODE_ENV !== 'production' && assert(install.installed,
            `not installed. Make sure to call \`Vue.use(VueRouter)\` ` +
            `before creating root instance.`)

        // app为在router对象初始化时执行init方法的参数（根实例），将根实例添加到apps数组中（用于多次执行VueRouter创建多个实例，比较少用）
        this.apps.push(app)

        // set up app destroyed handler
        // https://github.com/vuejs/vue-router/issues/2639
        app.$once('hook:destroyed', () => {
            // clean out app from this.apps array once destroyed
            const index = this.apps.indexOf(app)
            if (index > -1) {
                this.apps.splice(index, 1)
            }
            // ensure we still have a main app or null if no apps
            // we do not release the router so it can be reused
            if (this.app === app) {
                this.app = this.apps[0] || null
            }
        })

        // main app previously initialized
        // return as we don't need to set up new history listener
        // 保证app属性只有唯一一个
        if (this.app) {
            return
        }

        this.app = app

        // 赋值路由模式
        const history = this.history

        if (history instanceof HTML5History) {
            history.transitionTo(history.getCurrentLocation())
        } else if (history instanceof HashHistory) {
            // 添加hashchange监听
            const setupHashListener = () => {
                history.setupListeners()
            }
            // 路由跳转
            history.transitionTo(history.getCurrentLocation(),
                // 成功回调(给哈希路由的模式监听浏览器的popState和hashchange)
                setupHashListener,
                // 取消回调
                setupHashListener)
        }

        /**
         * 注册回调，当history发生改变后会执行回调（src/history/base.js:221）
         * 即修改_route属性，因为_route属性是一个视图依赖的响应式变量，所以会触发视图的重新渲染
         * 至于触发 _route 的 setter 为什么会更新视图，请参考 router-view 组件
         */
        history.listen(route => {
            this.apps.forEach((app) => {
                app._route = route
            })
        })
    }

    /**
     * 全局前置守卫
     * @param fn
     * @returns {Function}
     */
    beforeEach (fn: Function): Function {
        return registerHook(this.beforeHooks, fn)
    }

    /**
     * 全局解析守卫
     * @param fn
     * @returns {Function}
     */
    beforeResolve (fn: Function): Function {
        return registerHook(this.resolveHooks, fn)
    }

    /**
     * 全局后置钩子
     * @param fn
     * @returns {Function}
     */
    afterEach (fn: Function): Function {
        return registerHook(this.afterHooks, fn)
    }

    /**
     * 该方法把一个回调排队，在路由完成初始导航时调用，这意味着它可以解析所有的异步进入钩子和路由初始化相关联的异步组件。
     * 这可以有效确保服务端渲染时服务端和客户端输出的一致。
     * @param cb
     * @param errorCb
     */
    onReady (cb: Function, errorCb?: Function) {
        this.history.onReady(cb, errorCb)
    }

    /**
     * 注册一个回调，该回调会在路由导航过程中出错时被调用。注意被调用的错误必须是下列情形中的一种：
     *      误在一个路由守卫函数中被同步抛出；
     *      错误在一个路由守卫函数中通过调用 next(err) 的方式异步捕获并处理；
     *      渲染一个路由的过程中，需要尝试解析一个异步组件时发生错误。
     * @param errorCb
     */
    onError (errorCb: Function) {
        this.history.onError(errorCb)
    }

    /**
     * 想要导航到不同的 URL，则使用 router.push 方法。这个方法会向 history 栈添加一个新的记录，所以，当用户点击浏览器后退按钮时，则回到之前的 URL。
     * @param location
     * @param onComplete
     * @param onAbort
     * @returns {Promise<R>}
     */
    push (location: RawLocation, onComplete?: Function, onAbort?: Function) {
        // $flow-disable-line
        if (!onComplete && !onAbort && typeof Promise !== 'undefined') {
            return new Promise((resolve, reject) => {
                this.history.push(location, resolve, reject)
            })
        } else {
            this.history.push(location, onComplete, onAbort)
        }
    }

    /**
     * 跟 router.push 很像，唯一的不同就是，它不会向 history 添加新记录，而是跟它的方法名一样 —— 替换掉当前的 history 记录。
     * @param location
     * @param onComplete
     * @param onAbort
     * @returns {Promise<R>}
     */
    replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {
        // $flow-disable-line
        if (!onComplete && !onAbort && typeof Promise !== 'undefined') {
            return new Promise((resolve, reject) => {
                this.history.replace(location, resolve, reject)
            })
        } else {
            this.history.replace(location, onComplete, onAbort)
        }
    }

    /**
     * 这个方法的参数是一个整数，意思是在 history 记录中向前或者后退多少步，类似 window.history.go(n)。
     * @param n
     */
    go (n: number) {
        this.history.go(n)
    }

    back () {
        this.go(-1)
    }

    forward () {
        this.go(1)
    }

    /**
     * 返回目标位置或是当前路由匹配的组件数组 (是数组的定义/构造类，不是实例)。通常在服务端渲染的数据预加载时使用。
     * @param to
     * @returns {*[]|*}
     */
    getMatchedComponents (to?: RawLocation | Route): Array<any> {
        const route: any = to
            ? to.matched
                ? to
                : this.resolve(to).route
            : this.currentRoute
        if (!route) {
            return []
        }
        return [].concat.apply([], route.matched.map(m => {
            return Object.keys(m.components).map(key => {
                return m.components[key]
            })
        }))
    }

    /**
     * 手动解析生成一个路由的对象
     * 解析目标位置 (格式和 <router-link> 的 to prop 一样)。
     * current 是当前默认的路由 (通常你不需要改变它)
     * append 允许你在 current 路由上附加路径 (如同 router-link)
     * @param to
     * @param current
     * @param append
     * @returns {{route: Route, location: Location, href: string, normalizedTo: Location, resolved: Route}}
     */
    resolve (to: RawLocation,
        current?: Route,
        append?: boolean): {
        location: Location,
        route: Route,
        href: string,
        // for backwards compat
        // 向后兼容
        normalizedTo: Location,
        resolved: Route
    } {
        current = current || this.history.current
        const location = normalizeLocation(to,
            current,
            append,
            this)
        const route = this.match(location, current)
        const fullPath = route.redirectedFrom || route.fullPath
        const base = this.history.base
        const href = createHref(base, fullPath, this.mode)
        return {
            location,
            route,
            href,
            // for backwards compat
            normalizedTo: location,
            resolved: route
        }
    }

    /**
     * 动态添加更多的路由规则。参数必须是一个符合 routes 选项要求的数组。
     * @param routes
     */
    addRoutes (routes: Array<RouteConfig>) {
        this.matcher.addRoutes(routes)
        if (this.history.current !== START) {
            this.history.transitionTo(this.history.getCurrentLocation())
        }
    }
}

function registerHook (list: Array<any>, fn: Function): Function {
    list.push(fn)
    return () => {
        const i = list.indexOf(fn)
        if (i > -1) list.splice(i, 1)
    }
}

function createHref (base: string, fullPath: string, mode) {
    var path = mode === 'hash' ? '#' + fullPath : fullPath
    return base ? cleanPath(base + '/' + path) : path
}

VueRouter.install = install
VueRouter.version = '__VERSION__'

if (inBrowser && window.Vue) {
    window.Vue.use(VueRouter)
}
