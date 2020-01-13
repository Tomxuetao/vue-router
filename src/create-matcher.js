/* @flow */

import type VueRouter from './index'
import { resolvePath } from './util/path'
import { assert, warn } from './util/warn'
import { createRoute } from './util/route'
import { fillParams } from './util/params'
import { createRouteMap } from './create-route-map'
import { normalizeLocation } from './util/location'

export type Matcher = {
    match: (raw: RawLocation, current?: Route, redirectedFrom?: Location) => Route;
    addRoutes: (routes: Array<RouteConfig>) => void;
};

/**
 * createMatcher返回一个含有match方法和addRoutes方法的对象给router对象的matcher属性
 * @param routes: routes为实例化vueRouter的路由列表
 * @param router
 * @returns {{match: match, addRoutes: addRoutes}}
 */
export function createMatcher (routes: Array<RouteConfig>, router: VueRouter): Matcher {
    // 创建路由映射表
    const { pathList, pathMap, nameMap } = createRouteMap(routes)

    /**
     * routes 生成三个路由映射表后，会向外暴露一个动态添加路由的 API
     * 这个 api 日常开发也遇到过，用于动态注册路由，它的原理其实很简单，
     * 就是接受一个 routes 数组，再次调用 createRouteMap 将数组每个元素转换成路由记录 (RouteRecord) ，
     * 然后合并到之前生成的路由映射表中
     * @param routes
     */
    function addRoutes (routes) {
        // 创建路由的映射表
        createRouteMap(routes, pathList, pathMap, nameMap)
    }

    /**
     * 函数用于创建 $route 对象
     * route 是针对 new Router 时传入的 routes 数组的每个元素，也就是路由配置项对象，
     * 而 $route 是最终返回作为 Vue.prototype.$route 的对象，在类型定义中，route 的类型是 RouteConfig，
     * 而 $route 的类型是 Route，具体接口的定义可以查看源代码，虽然在源码中两者变量名都是 route，但我下文会使用 $route 来区分最终返回的 route 对象
     * @param raw: 值为location.pathname（第一次跳转）或者 location 对象
     * @param currentRoute
     * @param redirectedFrom
     * @returns {Route}
     */
    function match (raw: RawLocation, currentRoute?: Route, redirectedFrom?: Location): Route {
        // 首先会执行 normalizeLocation 函数， 它是一个辅助函数，会将调用 router.push / router.replace 时跳转的路由地址转为一个 location 对象
        const location = normalizeLocation(raw, currentRoute, false, router)
        const { name } = location

        // 如果是命名路由，就判断记录中是否有该命名路由配置
        if (name) {
            const record = nameMap[name]
            if (process.env.NODE_ENV !== 'production') {
                warn(record, `Route with name '${name}' does not exist`)
            }
            // 没有找到表示没有匹配的路由, 创建route路由对象
            if (!record) {
                return _createRoute(null, location)
            }

            const paramNames = record.regex.keys
                .filter(key => !key.optional)
                .map(key => key.name)

            // 参数处理
            if (typeof location.params !== 'object') {
                location.params = {}
            }

            if (currentRoute && typeof currentRoute.params === 'object') {
                for (const key in currentRoute.params) {
                    if (!(key in location.params) && paramNames.indexOf(key) > -1) {
                        location.params[key] = currentRoute.params[key]
                    }
                }
            }

            location.path = fillParams(record.path, location.params, `named route "${name}"`)
            return _createRoute(record, location, redirectedFrom)
        } else if (location.path) {
            // 非命名路由处理,去pathList和pathMap根据path找对应的路由信息
            location.params = {}
            for (let i = 0; i < pathList.length; i++) {
                // 查找记录
                const path = pathList[i]
                const record = pathMap[path]
                // 使用当前 location 的 path 属性和每个路由记录的正则属性进行匹配
                if (matchRoute(record.regex, location.path, location.params)) {
                    // 结合 record 创建route路由对象
                    return _createRoute(record, location, redirectedFrom)
                }
            }
        }

        // no match
        // 创建一个匹配失败的route对象（会在视图中创建一个注释节点）
        return _createRoute(null, location)
    }

    function redirect (record: RouteRecord, location: Location): Route {
        const originalRedirect = record.redirect
        let redirect = typeof originalRedirect === 'function'
            ? originalRedirect(createRoute(record, location, null, router))
            : originalRedirect

        if (typeof redirect === 'string') {
            redirect = { path: redirect }
        }

        if (!redirect || typeof redirect !== 'object') {
            if (process.env.NODE_ENV !== 'production') {
                warn(false, `invalid redirect option: ${JSON.stringify(redirect)}`)
            }
            return _createRoute(null, location)
        }

        const re: Object = redirect
        const { name, path } = re
        let { query, hash, params } = location
        query = re.hasOwnProperty('query') ? re.query : query
        hash = re.hasOwnProperty('hash') ? re.hash : hash
        params = re.hasOwnProperty('params') ? re.params : params

        if (name) {
            // resolved named direct
            const targetRecord = nameMap[name]
            if (process.env.NODE_ENV !== 'production') {
                assert(targetRecord, `redirect failed: named route "${name}" not found.`)
            }
            return match({
                _normalized: true,
                name,
                query,
                hash,
                params
            }, undefined, location)
        } else if (path) {
            // 1. resolve relative redirect
            const rawPath = resolveRecordPath(path, record)
            // 2. resolve params
            const resolvedPath = fillParams(rawPath, params, `redirect route with path "${rawPath}"`)
            // 3. rematch with existing query and hash
            return match({
                _normalized: true,
                path: resolvedPath,
                query,
                hash
            }, undefined, location)
        } else {
            if (process.env.NODE_ENV !== 'production') {
                warn(false, `invalid redirect option: ${JSON.stringify(redirect)}`)
            }
            return _createRoute(null, location)
        }
    }

    function alias (record: RouteRecord, location: Location, matchAs: string): Route {
        const aliasedPath = fillParams(matchAs, location.params, `aliased route with path "${matchAs}"`)
        const aliasedMatch = match({
            _normalized: true,
            path: aliasedPath
        })
        if (aliasedMatch) {
            const matched = aliasedMatch.matched
            const aliasedRecord = matched[matched.length - 1]
            location.params = aliasedMatch.params
            return _createRoute(aliasedRecord, location)
        }
        return _createRoute(null, location)
    }

    /**
     * 创建路由对象,一般情况下会执行createRoute方法
     * @param record
     * @param location
     * @param redirectedFrom
     * @returns {Route}
     * @private
     */
    function _createRoute (record: ?RouteRecord, location: Location, redirectedFrom?: Location): Route {
        if (record && record.redirect) {
            return redirect(record, redirectedFrom || location)
        }
        if (record && record.matchAs) {
            return alias(record, location, record.matchAs)
        }
        return createRoute(record, location, redirectedFrom, router)
    }

    return {
        match,
        addRoutes
    }
}

/**
 * 遍历每个记录的regex正则，匹配传入的当前的location.path，成功则返回true
 * @param regex
 * @param path
 * @param params
 * @returns {boolean}
 */
function matchRoute (regex: RouteRegExp, path: string, params: Object): boolean {
    const m = path.match(regex)

    if (!m) {
        return false
    } else if (!params) {
        return true
    }

    for (let i = 1, len = m.length; i < len; ++i) {
        const key = regex.keys[i - 1]
        const val = typeof m[i] === 'string' ? decodeURIComponent(m[i]) : m[i]
        if (key) {
            // Fix #1994: using * with props: true generates a param named 0
            params[key.name || 'pathMatch'] = val
        }
    }

    return true
}

function resolveRecordPath (path: string, record: RouteRecord): string {
    return resolvePath(path, record.parent ? record.parent.path : '/', true)
}
