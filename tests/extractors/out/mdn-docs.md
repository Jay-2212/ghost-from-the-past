# Fetch API

> Documentation · developer.mozilla.org

The Fetch API provides an interface for fetching resources (including across the network). It is a more powerful and flexible replacement for [`XMLHttpRequest`](/en-US/docs/Web/API/XMLHttpRequest).

## [Concepts and usage](#concepts_and_usage)

The Fetch API uses [`Request`](/en-US/docs/Web/API/Request) and [`Response`](/en-US/docs/Web/API/Response) objects (and other things involved with network requests), as well as related concepts such as CORS and the HTTP Origin header semantics.

For making a request and fetching a resource, use the [`fetch()`](/en-US/docs/Web/API/Window/fetch "fetch()") method. It is a global method in both [`Window`](/en-US/docs/Web/API/Window) and [`Worker`](/en-US/docs/Web/API/WorkerGlobalScope "Worker") contexts. This makes it available in pretty much any context you might want to fetch resources in.

The `fetch()` method takes one mandatory argument, the path to the resource you want to fetch. It returns a [`Promise`](/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) that resolves to the [`Response`](/en-US/docs/Web/API/Response) to that request — as soon as the server responds with headers — **even if the server response is an HTTP error status**. You can also optionally pass in an `init` options object as the second argument (see [`Request`](/en-US/docs/Web/API/Request)).

Once a [`Response`](/en-US/docs/Web/API/Response) is retrieved, there are a number of methods available to define what the body content is and how it should be handled.

You can create a request and response directly using the [`Request()`](/en-US/docs/Web/API/Request/Request "Request()") and [`Response()`](/en-US/docs/Web/API/Response/Response "Response()") constructors, but it's uncommon to do this directly. Instead, these are more likely to be created as results of other API actions (for example, [`FetchEvent.respondWith()`](/en-US/docs/Web/API/FetchEvent/respondWith) from service workers).

Find out more about using the Fetch API features in [Using Fetch](/en-US/docs/Web/API/Fetch_API/Using_Fetch).

### [Deferred Fetch](#deferred_fetch)

The [`fetchLater()`](/en-US/docs/Web/API/Window/fetchLater "fetchLater()") API enables a developer to request a _deferred fetch_, that can be sent after a specified period of time, or when the page is closed or navigated away from. See [Using Deferred Fetch](/en-US/docs/Web/API/Fetch_API/Using_Deferred_Fetch).

## [Interfaces](#interfaces)

[`Window.fetch()`](/en-US/docs/Web/API/Window/fetch) and [`WorkerGlobalScope.fetch()`](/en-US/docs/Web/API/WorkerGlobalScope/fetch)

The `fetch()` method used to fetch a resource.

[`Window.fetchLater()`](/en-US/docs/Web/API/Window/fetchLater)

Used to make a deferred fetch request.

[`DeferredRequestInit`](/en-US/docs/Web/API/DeferredRequestInit)

Represents the set of options that can be used to configure a deferred fetch request.

[`FetchLaterResult`](/en-US/docs/Web/API/FetchLaterResult)

Represents the result of requesting a deferred fetch.

[`Headers`](/en-US/docs/Web/API/Headers)

Represents response/request headers, allowing you to query them and take different actions depending on the results.

[`Request`](/en-US/docs/Web/API/Request)

Represents a resource request.

[`Response`](/en-US/docs/Web/API/Response)

Represents the response to a request.

## [HTTP headers](#http_headers)

[`deferred-fetch`](/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/deferred-fetch)

Controls the [top-level quota](/en-US/docs/Web/API/Fetch_API/Using_Deferred_Fetch#quotas) for the `fetchLater()` API.

[`deferred-fetch-minimal`](/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/deferred-fetch-minimal)

Controls the [shared cross-origin subframe quota](/en-US/docs/Web/API/Fetch_API/Using_Deferred_Fetch#quotas) for the `fetchLater()` API.

## [Specifications](#specifications)

Specification

[Fetch
\# fetch-method](https://fetch.spec.whatwg.org/#fetch-method)

[Fetch
\# deferred-fetch](https://fetch.spec.whatwg.org/#deferred-fetch)

## [Browser compatibility](#browser_compatibility)

### [api.fetch](#api.fetch)

### [api.Window.fetchLater](#api.Window.fetchLater)

## [See also](#see_also)

-   [Using Fetch](/en-US/docs/Web/API/Fetch_API/Using_Fetch)
-   [Service Worker API](/en-US/docs/Web/API/Service_Worker_API)
-   [HTTP access control (CORS)](/en-US/docs/Web/HTTP/Guides/CORS)
-   [HTTP](/en-US/docs/Web/HTTP)
-   [Local network access](/en-US/docs/Web/Security/Defenses/Local_network_access)

## Help improve MDN

[Learn how to contribute](/en-US/docs/MDN/Community/Getting_started)

This page was last modified on Jun 8, 2026 by [MDN contributors](/en-US/docs/Web/API/Fetch_API/contributors.txt).

[View this page on GitHub](https://github.com/mdn/content/blob/main/files/en-us/web/api/fetch_api/index.md?plain=1 "Folder: en-us/web/api/fetch_api (Opens in a new tab)") • [Report a problem with this content](https://github.com/mdn/content/issues/new?template=page-report.yml&mdn-url=https%3A%2F%2Fdeveloper.mozilla.org%2Fen-US%2Fdocs%2FWeb%2FAPI%2FFetch_API&metadata=%3C%21--+Do+not+make+changes+below+this+line+--%3E%0A%3Cdetails%3E%0A%3Csummary%3EPage+report+details%3C%2Fsummary%3E%0A%0A*+Folder%3A+%60en-us%2Fweb%2Fapi%2Ffetch_api%60%0A*+MDN+URL%3A+https%3A%2F%2Fdeveloper.mozilla.org%2Fen-US%2Fdocs%2FWeb%2FAPI%2FFetch_API%0A*+GitHub+URL%3A+https%3A%2F%2Fgithub.com%2Fmdn%2Fcontent%2Fblob%2Fmain%2Ffiles%2Fen-us%2Fweb%2Fapi%2Ffetch_api%2Findex.md%0A*+Last+commit%3A+https%3A%2F%2Fgithub.com%2Fmdn%2Fcontent%2Fcommit%2F75016e5d37ecff3b11de4c2ef6665178f654797e%0A*+Document+last+modified%3A+2026-06-08T12%3A44%3A07.000Z%0A%0A%3C%2Fdetails%3E "This will take you to GitHub to file a new issue.")