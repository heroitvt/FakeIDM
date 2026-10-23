# Research provenance

REA `rea-agents@6.7.0` was used separately to inspect PE resources of the official IDM installer during initial development. It exposed resource structure/icons; it did not recover IDM's networking code or establish its internal segmentation algorithm.

FakeIDM's Node.js engine and UI are independent implementations. REA is not a runtime dependency. Proprietary installers, extracted IDM assets and research caches are excluded from this repository.

References:

- REA: https://github.com/morluto/rea
- IDM public features: https://www.internetdownloadmanager.com/features2.html
- Electron packaging: https://www.electronjs.org/docs/latest/tutorial/application-distribution
- Electron sandbox: https://www.electronjs.org/docs/latest/tutorial/sandbox
- Drive downloads: https://developers.google.com/workspace/drive/api/guides/manage-downloads

Drive support in this source includes captured browser download URLs and URL-scoped cookies. The review found that domain-wide Google cookie merging and forwarding credentials across redirects were unsafe; these behaviors are removed. HTML responses fail explicitly. This does not implement automatic share-page/confirmation resolution or bypass download quotas and access restrictions.
