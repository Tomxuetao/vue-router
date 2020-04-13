/**
 * 当调用 Vue.use(Router) 时，会给全局的 beforeCreate，destroyed 混入2个钩子，
 * 使得在组件初始化时能够通过 this.$router / this.$route 访问到根实例的 router / route 对象，
 * 同时还定义了全局组件 router-view / router-link。
 *
 * 在实例化 vue-router 时，通过 createRouteMap 创建3个路由映射表，
 * 保存了所有路由的记录，另外创建了 match 函数用来创建 $route 对象，
 * addRoutes 函数用来动态生成路由，这2个函数都是需要依赖路由映射表生成的。
 *
 * vue-router 还给开发者提供了3种不同的路由模式，每个模式下的跳转逻辑都有所差异
 */

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
     * 注册组件实例(./src/components/view.js)
     * 当组件被初始化后进入 beforeCreate 钩子时，才会有组件实例，这时候才会执行 registerInstance
     * @param vm
     * @param callVal
     */
    const registerInstance = (vm, callVal) => {
        // i为 router-view 组件占位符 vnode
        // 这里会执行 registerRouteInstance，将当前组件实例赋值给匹配到的路由记录（用于beforeRouteEnter的回调获取vm实例）
        let i = vm.$options._parentVnode
        /**
         *  vm.$options._parentVnode.data.registerRouteInstance;你可能会疑惑，
         *  它是从哪里来的 。它是在 ./src/components/view.js , route-view 组件的 render 方法里面定义的。主要用于注册及销毁实例。
         */
        if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) {
            i(vm, callVal)
        }
    }

    /**
     * 通过全局mixin注入生命周期处理函数
     * 给每个组件的钩子函数混入实现
     * 可以发现在 `beforeCreate` 钩子执行时，会初始化路由
     */
    Vue.mixin({
        //  全局混入，在beforeCreate中会初始化当前路由的信息
        /** vue-router流程
         * 触发路由跳转 => init => transitionTo => 执行准备离开相关的路由钩子 => 接受到异步组件并解析 => 执行准备进入的路由的钩子 => 确认导航成功  => 更新视图（触发完组件的所有声明周期） => 触发beforeRouterEnter的回调
         */
        beforeCreate () {
            /**
             * new Vue({
             *  router,
             *  store,
             *  render: h => h(App)
             *  }).$mount('#app')
             *  当是根实例时会进行路由初始化操作，this.$options.router实际就是通过new Vue() 传过来的 router 对象
             */
            if (isDef(this.$options.router)) {
                // 将routerRoot等于根实例
                this._routerRoot = this
                // 给根实例添加_router属性等于router对象
                this._router = this.$options.router
                // 执行init方法初始化路由传入根实例, this指向Vue
                this._router.init(this)
                /** 将根实例的_router属性，即组件实例的$route属性定义为响应式，每次路由确认导航时会触发setter，将根实例重新渲染**/
                // 每次路由切换都会执行回调修改_router(src/index.js:124)
                Vue.util.defineReactive(this, '_route', this._router.history.current)
            } else {
                // 非根实例则等于它父组件的_routerRoot(因为是树形结构所以所有的组件的_routerRoot都等于根实例)
                this._routerRoot = (this.$parent && this.$parent._routerRoot) || this
            }
            // 注册实例
            registerInstance(this, this)
        },
        destroyed () {
            // 销毁实例
            registerInstance(this)
        }
    })

    /**
     * 挂在变量到Vue原型上
     * 这里通过 Object.defineProperty 定义 get 来实现，
     * 而不使用 Vue.prototype.$router = this.this._routerRoot._router。
     * 是为了让其只读，不可修改
     */
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

    // 定义合并策略
    const strats = Vue.config.optionMergeStrategies
    // use the same hook merging strategy for route hooks
    strats.beforeRouteEnter = strats.beforeRouteLeave = strats.beforeRouteUpdate = strats.created
}
