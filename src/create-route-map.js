/* @flow */

import Regexp from 'path-to-regexp'
import {cleanPath} from './util/path'
import {assert, warn} from './util/warn'

/**
 * 通过用户配置的路由规则来创建对应的路由映射表
 * 第一次执行时后面3个参数都是undefined
 * @param routes
 * @param oldPathList
 * @param oldPathMap
 * @param oldNameMap
 * 返回3个对象pathList,pathMap,nameMap
 * @returns {{nameMap: Dictionary<RouteRecord>, pathMap: Dictionary<RouteRecord>, pathList: Array<string>}}
 */
export function createRouteMap (
    routes: Array<RouteConfig>,
    oldPathList?: Array<string>,
    oldPathMap?: Dictionary<RouteRecord>,
    oldNameMap?: Dictionary<RouteRecord>): {
    pathList: Array<string>,
    pathMap: Dictionary<RouteRecord>,
    nameMap: Dictionary<RouteRecord>
} {
    // 创建映射表
    // the path list is used to control path matching priority
    // 数组，保存了 route 对象的路径
    const pathList: Array<string> = oldPathList || []
    // $flow-disable-line
    // 对象，保存了所有 route 对象对应的 record 对象
    const pathMap: Dictionary<RouteRecord> = oldPathMap || Object.create(null)
    // $flow-disable-line
    // 对象，保存了所有含有name属性的 route 对象对应的 record 对象
    const nameMap: Dictionary<RouteRecord> = oldNameMap || Object.create(null)

    // 遍历路由配置，为每个配置添加路由记录
    routes.forEach(route => {
        // 遍历每项路由数组，执行addRouteRecord函数，将上面3个参数和当前的遍历项作为参数传入
        // 根据配置项routes生成3个路由信息(pathList, pathMap, nameMap)
        addRouteRecord(pathList, pathMap, nameMap, route)
    })

    // ensure wildcard routes are always at the end
    // pathList数组中含有通配符（*），会把他放到结尾
    // ensure wildcard routes are always at the end
    for (let i = 0, l = pathList.length; i < l; i++) {
        if (pathList[i] === '*') {
            pathList.push(pathList.splice(i, 1)[0])
            l--
            i--
        }
    }

    if (process.env.NODE_ENV === 'development') {
        // warn if routes do not include leading slashes
        const found = pathList
            // check for missing leading slash
            .filter(path => path && path.charAt(0) !== '*' && path.charAt(0) !== '/')

        if (found.length > 0) {
            const pathNames = found.map(path => `- ${path}`).join('\n')
            warn(false, `Non-nested routes must include a leading slash character. Fix the following routes: \n${pathNames}`)
        }
    }

    return {
        pathList,
        pathMap,
        nameMap
    }
}

/**
 * addRouteRecord会遍历所有routes逐步给pathMap/nameMap添加路由的信息（record）, 第一次调用前3个参数为空对象
 * @param pathList
 * @param pathMap
 * @param nameMap
 * @param route
 * @param parent
 * @param matchAs
 */
function addRouteRecord (
    pathList: Array<string>,
    pathMap: Dictionary<RouteRecord>,
    nameMap: Dictionary<RouteRecord>,
    route: RouteConfig,
    parent?: RouteRecord, matchAs?: string) {
    // 获取路由的path属性和name属性从路由的配置中
    const {path, name} = route
    if (process.env.NODE_ENV !== 'production') {
        assert(path != null, `"path" is required in a route configuration.`)
        assert(typeof route.component !== 'string',
            `route config "component" for path: ${String(path || name)} cannot be a ` + `string id. Use an actual component instead.`)
    }

    // 路径正则配置
    const pathToRegexpOptions: PathToRegexpOptions = route.pathToRegexpOptions || {}
    /**
     * 在创建路由记录前，会使用 normalizedPath 规范化 route 对象的路径，
     * 如果传入的 route 对象含有父级 route 对象，会将父级 route 对象的 path 拼上当前的 path
     * @type {string}
     */
    const normalizedPath = normalizePath(path, parent, pathToRegexpOptions.strict)

    if (typeof route.caseSensitive === 'boolean') {
        pathToRegexpOptions.sensitive = route.caseSensitive
    }

    /**
     * 定义当前route的路由记录，路由记录基于路由配置项对象扩展了一些额外属性
     */
    const record: RouteRecord = {
        // 规范化后的路由,路由的完整路径
        path: normalizedPath,
        // 匹配到当前 route 对象的正则表达式
        regex: compileRouteRegex(normalizedPath, pathToRegexpOptions),
        // route 对象的组件（因为 vue-router 中有命名视图，所以会默认放在 default 属性下，instances 同理）
        components: route.components || {default: route.component},
        // route 对象对应的 vm 实例
        instances: {},
        // route 对象的名字
        name,
        // route 对象的父级路由记录
        parent,
        // 路由别名
        matchAs,
        // 路由重定向
        redirect: route.redirect,
        // 组件级别的路由钩子
        beforeEnter: route.beforeEnter,
        // 路由元信息
        meta: route.meta || {},
        // 路由跳转时的传参
        props: route.props == null ? {} : route.components ? route.props : {default: route.props}
    }

    if (route.children) {
        // Warn if route is named, does not redirect and has a default child route.
        // If users navigate to this route by name, the default child will
        // not be rendered (GH Issue #629)
        if (process.env.NODE_ENV !== 'production') {
            if (
                route.name &&
                !route.redirect &&
                route.children.some(child => /^\/?$/.test(child.path))
            ) {
                warn(false,
                    `Named Route '${route.name}' has a default child route. ` +
                    `When navigating to this named route (:to="{name: '${
                        route.name
                    }'"), ` +
                    `the default child route will not be rendered. Remove the name from ` +
                    `this route and use the name of the default child route for named ` +
                    `links instead.`)
            }
        }
        // 递归路由配置的children属性，添加路由记录
        route.children.forEach(child => {
            const childMatchAs = matchAs ? cleanPath(`${matchAs}/${child.path}`) : undefined
            // 与第一次调用addRouteRecord不同的是，递归遍历children会额外传入record,childMatchAs参数
            // record是当前路由项，即子组件父路由的路由记录
            addRouteRecord(pathList, pathMap, nameMap, child, record, childMatchAs)
        })
    }

    // 递归遍历到最底部的route(叶子节点)
    // 构造pathMap和nameMap映射表,第一次pathMap为空对象，后续使用addRoutes动态添加路由时会有已有的路由映射表）
    if (!pathMap[record.path]) {
        // pathList是一个数组，保存着routes列表中所有route的路径
        pathList.push(record.path)
        //  pathMap是一个对象，保存着routes列表中所有route的记录（87）,属性是route的路径，值是route的记录
        pathMap[record.path] = record
    }

    // 如果路由有别名，给别名添加路由记录
    if (route.alias !== undefined) {
        const aliases = Array.isArray(route.alias) ? route.alias : [route.alias]
        for (let i = 0; i < aliases.length; ++i) {
            const alias = aliases[i]
            if (process.env.NODE_ENV !== 'production' && alias === path) {
                warn(false,
                    `Found an alias with the same value as the path: "${path}". You have to remove that alias. It will be ignored in development.`)
                // skip in dev to make it work
                continue
            }

            const aliasRoute = {
                path: alias,
                children: route.children
            }
            addRouteRecord(pathList,
                pathMap,
                nameMap,
                aliasRoute,
                parent,
                record.path || '/' // matchAs
            )
        }
    }

    // 命名路由，添加记录
    if (name) {
        if (!nameMap[name]) {
            nameMap[name] = record
        } else if (process.env.NODE_ENV !== 'production' && !matchAs) {
            warn(false,
                `Duplicate named routes definition: ` +
                `{ name: "${name}", path: "${record.path}" }`)
        }
    }
}

function compileRouteRegex (path: string, pathToRegexpOptions: PathToRegexpOptions): RouteRegExp {
    const regex = Regexp(path, [], pathToRegexpOptions)
    if (process.env.NODE_ENV !== 'production') {
        const keys: any = Object.create(null)
        regex.keys.forEach(key => {
            warn(!keys[key.name],
                `Duplicate param keys in route with path: "${path}"`)
            keys[key.name] = true
        })
    }
    return regex
}

/**
 * 标准化路由的方法,如果path的第一个字符为/则直接返回
 * @param path
 * @param parent
 * @param strict
 * @returns {string}
 */
function normalizePath (path: string, parent?: RouteRecord, strict?: boolean): string {
    if (!strict) path = path.replace(/\/$/, '')
    if (path[0] === '/') return path
    if (parent == null) return path
    // 如果有含有父路由会进入这个方法,将父路由的path值拼上子路由的path值返回该子路由完整的path值
    return cleanPath(`${parent.path}/${path}`)
}
