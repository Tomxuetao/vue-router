## History API
 > DOM window 对象通过history对象提供了对浏览器会话历史的访问。它暴露了很多有用的方法和属性，允许你在用户浏览历史中向前和向后跳转，同时——从HTML5开始——提供了对history栈中内容的操作。

### 在history中跳转
> 使用 back(), forward()和 go() 方法来完成在用户历史记录中向后和向前的跳转。

### 添加和修改历史记录中的条目
> HTML5引入了 history.pushState() 和 history.replaceState() 方法，它们分别可以添加和修改历史记录条目。这些方法通常与window.onpopstate 配合使用。

> 使用 history.pushState() 可以改变referrer，它在用户发送 XMLHttpRequest 请求时在HTTP头部使用，改变state后创建的 XMLHttpRequest 对象的referrer都会被改变。
> 因为referrer是标识创建  XMLHttpRequest 对象时 this 所代表的window对象中document的URL。

- pushState()方法
   > pushState() 需要三个参数: 一个状态对象, 一个标题 (目前被忽略), 和 (可选的) 一个URL。
    - 状态对象 —— 状态对象state是一个JavaScript对象，通过pushState () 创建新的历史记录条目。无论什么时候用户导航到新的状态，popstate事件就会被触发，且该事件的state属性包含该历史记录条目状态对象的副本。
    - 标题 ——  Firefox 目前忽略这个参数，但未来可能会用到。在此处传一个空字符串应该可以安全的防范未来这个方法的更改。或者，你可以为跳转的state传递一个短标题。
    - URL —— 该参数定义了新的历史URL记录。注意，调用 pushState() 后浏览器并不会立即加载这个URL，但可能会在稍后某些情况下加载这个URL，比如在用户重新打开浏览器时。新URL不必须为绝对路径。如果新URL是相对路径，那么它将被作为相对于当前URL处理。新URL必须与当前URL同源，否则 pushState() 会抛出一个异常。该参数是可选的，缺省为当前URL。
    
- replaceState()方法
    > history.replaceState() 的使用与 history.pushState() 非常相似，区别在于 replaceState() 是修改了当前的历史记录项而不是新建一个。 
    > 注意这并不会阻止其在全局浏览器历史记录中创建一个新的历史记录项。replaceState() 的使用场景在于为了响应用户操作，你想要更新状态对象state或者当前历史记录的URL。

###popstate事件
   - window.onpopstate是popstate事件在window对象上的事件处理程序。
   - 每当处于激活状态的历史记录条目发生变化时,popstate事件就会在对应window对象上触发。如果当前处于激活状态的历史记录条目是由history.pushState()方法创建,或者由history.replaceState()方法修改过的, 则popstate事件对象的state属性包含了这个历史记录条目的state对象的一个拷贝。
   - 调用history.pushState()或者history.replaceState()不会触发popstate事件。popstate事件只会在浏览器某些行为下触发, 比如点击后退、前进按钮(或者在JavaScript中调用history.back()、history.forward()、history.go()方法)。
   - 当网页加载时,各浏览器对popstate事件是否触发有不同的表现,Chrome 和 Safari会触发popstate事件, 而Firefox不会。

## Location API
 > Location 接口表示其链接到的对象的位置（URL）。所做的修改反映在与之相关的对象上。 Document 和 Window 接口都有这样一个链接的Location，分别通过 Document.location和Window.location 访问。

### Location 属性
   > Location 接口不继承任何属性，但是实现了那些来自 URLUtils 的属性。
   - Location.href
   > 包含整个URL的一个DOMString
   - Location.protocol
   > 包含URL对应协议的一个DOMString，最后有一个":"
   - Location.host
   > 包含了域名的一个DOMString，可能在该串最后带有一个":"并跟上URL的端口号。
   - Location.hostname
   > 包含URL域名的一个DOMString。
   - Location.port
   > 包含端口号的一个DOMString。
   - Location.pathname
   > 包含URL中路径部分的一个DOMString，开头有一个“/"。
   - Location.search
   > 包含URL参数的一个DOMString，开头有一个“?”。
   - Location.hash
   > 包含块标识符的DOMString，开头有一个“#”。
   - Location.username
   > 包含URL中域名前的用户名的一个DOMString。
   - Location.password
   > 包含URL域名前的密码的一个 DOMString。
   - Location.origin
   > 只读属性，包含页面来源的域名的标准形式DOMString。

### Location 方法
   > Location没有继承任何方法，但实现了来自URLUtils的方法。
   - Location.assign()
   > 加载给定URL的内容资源到这个Location对象所关联的对象上。

   - Location.reload()
   > 重新加载来自当前 URL的资源。他有一个特殊的可选参数，类型为 Boolean，该参数为true时会导致该方法引发的刷新一定会从服务器上加载数据。如果是 false或没有制定这个参数，浏览器可能从缓存当中加载页面。

   - Location.replace()
   > 用给定的URL替换掉当前的资源。与 assign() 方法不同的是用 replace()替换的新页面不会被保存在会话的历史 History中，这意味着用户将不能用后退按钮转到该页面。

   - Location.toString()
   > 返回一个DOMString，包含整个URL。 它和读取URLUtils.href的效果相同。但是用它是不能够修改Location的值的。

