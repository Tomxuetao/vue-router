/* @flow */

export function runQueue (queue: Array<?NavigationGuard>, fn: Function, cb: Function) {
    // 队列中的函数都执行完毕，就会执行回调函数
    const step = index => {
        if (index >= queue.length) {
            cb()
        } else {
            if (queue[index]) {
                // 执行迭代器，用户在钩子函数中执行next()回调，回调中判断传参，没问题就执行next()，也就是fn函数中的第二个参数
                fn(queue[index], () => {
                    step(index + 1)
                })
            } else {
                step(index + 1)
            }
        }
    }
    // 取出队列中第一个钩子函数
    step(0)
}
