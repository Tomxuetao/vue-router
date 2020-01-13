/* @flow */

/**
 * 执行队列
 * runQueue 内部声明了一个 step 的函数，它一个是控制 runQueue 是否继续遍历的函数，
 * 当我们第一次执行时，给 step 函数传入参数 0 表示开始遍历 queue 第 1 个元素，
 * 通过 step 函数内部可以发现，它最终会执行参数 fn，也就是 iterator 这个迭代器函数，
 * 给它传入当前遍历的 queue 元素以及一个回调函数，这个回调函数里保存着遍历下个元素的逻辑，也就是说runQueue 将是否需要继续遍历的控制权传入了 iterator 函数中
 * @param queue: 守卫数组
 * @param fn:
 * @param cb:
 * runQueue 函数只负责遍历数组，并不会执行逻辑，它依次遍历 queue 数组的元素，
 * 每次遍历时会将当前元素交给外部定义的 iterator 迭代器去执行，而 iterator 迭代器一旦处理完当前元素就让 runQueue 遍历下个元素，
 * 且当数组全部遍历结束时，会执行作为回调的参数 cb
 */
export function runQueue (queue: Array<?NavigationGuard>, fn: Function, cb: Function) {
    // 队列中的函数都执行完毕，就会执行回调函数
    const step = index => {
        if (index >= queue.length) {
            cb() // 遍历结束后的回调
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
