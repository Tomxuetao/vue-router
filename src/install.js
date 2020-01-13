import View from './components/view'
import Link from './components/link'

export let _Vue

/**
 * 对于路由注册来说，核心就是调用 Vue.use(VueRouter)，使得 VueRouter 可以使用 Vue。
 * 然后通过 Vue 来调用 VueRouter 的 install 函数。在该函数中，核心就是给组件混入钩子函数和全局注册两个路由组件。
 * @param Vue
 * @returns {beforeCreate.$options.router|VueRouter}
 */
export function install (Vue) {
    // 确保install调用一次
    if (install.installed && _Vue === Vue) {
        return
    }

    install.installed = true
    // 把Vue赋值给全局变量
    _Vue = Vue

    /**
     * 判断是否为undefined的方法
     * @param v
     * @returns {boolean}
     */
    const isDef = v => v !== undefined

    /**
     * 注册实例
     * @param vm
     * @param callVal
     */
    const registerInstance = (vm, callVal) => {
        let i = vm.$options._parentVnode
        if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) {
            i(vm, callVal)
        }
    }

    /**
     * 给每个组件的钩子函数混入实现
     * 可以发现在 `beforeCreate` 钩子执行时，会初始化路由
     */
    Vue.mixin({
        // 只有根组件有router属性，所以根组件初始化时会初始化路由
        beforeCreate () {
            if (isDef(this.$options.router)) {
                // 跟路由设置成自己
                this._routerRoot = this
                this._router = this.$options.router
                // 初始化路由
                this._router.init(this)
                // 为_route实现双向绑定，触发组件渲染
                Vue.util.defineReactive(this, '_route', this._router.history.current)
            } else {
                // 用于router-view层级判断
                this._routerRoot = (this.$parent && this.$parent._routerRoot) || this
            }
            registerInstance(this, this)
        },
        destroyed () {
            registerInstance(this)
        }
    })

    // 将$router绑定到Vue的原型上
    Object.defineProperty(Vue.prototype, '$router', {
        get () {
            return this._routerRoot._router
        }
    })

    // 将$route绑定到Vue的原型上
    Object.defineProperty(Vue.prototype, '$route', {
        get () {
            return this._routerRoot._route
        }
    })

    // 全局注册组件router-view、router-link
    Vue.component('RouterView', View)
    Vue.component('RouterLink', Link)

    // 合并策略
    const strats = Vue.config.optionMergeStrategies
    // use the same hook merging strategy for route hooks
    strats.beforeRouteEnter = strats.beforeRouteLeave = strats.beforeRouteUpdate = strats.created
}
