/* @flow */

import { inBrowser } from './dom'
import { saveScrollPosition } from './scroll'
import { genStateKey, setStateKey, getStateKey } from './state-key'
import { extend } from './misc'

/**
 * 判断是否支持 pushState
 * @type {boolean|boolean|*}
 */
export const supportsPushState = inBrowser && (function () {
    const ua = window.navigator.userAgent

    if ((ua.indexOf('Android 2.') !== -1 || ua.indexOf('Android 4.0') !== -1) && ua.indexOf('Mobile Safari') !== -1 && ua.indexOf('Chrome') === -1 && ua.indexOf('Windows Phone') === -1) {
        return false
    }

    return window.history && 'pushState' in window.history
})()

/**
 *
 * @param url
 * @param replace
 */
export function pushState (url?: string, replace?: boolean) {
    saveScrollPosition()
    // try...catch the pushState call to get around Safari
    // DOM Exception 18 where it limits to 100 pushState calls
    const history = window.history
    try {
        // 即使使用hash路由，如果支持 pushState 最终也会使用 pushState 修改路由
        if (replace) {
            // preserve existing history state as it could be overriden by the user
            const stateCopy = extend({}, history.state)
            stateCopy.key = getStateKey()
            history.replaceState(stateCopy, '', url)
        } else {
            history.pushState({ key: setStateKey(genStateKey()) }, '', url)
        }
    } catch (e) {
        window.location[replace ? 'replace' : 'assign'](url)
    }
}

export function replaceState (url?: string) {
    pushState(url, true)
}
