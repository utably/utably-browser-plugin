# Documentation

Welcome! This directory is the contributor reference for the Utably
Browser Plugin. If you're just looking to install the extension, head
back to the [repository README](../README.md).

## 🚀 If you're new, start here

1. **[FAQ](faq.md)** — common questions, probably answered already.
2. **[Development setup](development.md)** — get the extension
   building and running locally in under 5 minutes.
3. **[Adapters](adapters.md)** — the main contribution surface, with
   a 10-minute worked example.
4. **[CONTRIBUTING](../CONTRIBUTING.md)** — PR rules, adapter
   checklist, and the DCO.

## 📖 Reference

| Document | What's inside |
|---|---|
| [`faq.md`](faq.md) | Common contributor and user questions. |
| [`development.md`](development.md) | Local setup, debugging, multi-browser builds, common issues. |
| [`adapters.md`](adapters.md) | How adapters work, the `common` helpers, writing your first one, priority guidelines. |
| [`architecture.md`](architecture.md) | Runtime components, user flow diagram, auth model, storage keys, stage routing. |
| [`api.md`](api.md) | Backend API contract the extension consumes. |
| [`fitcheck.md`](fitcheck.md) | FitCheck feature: response shape, caching, tier gating. |
| [`branching.md`](branching.md) | Branch strategy for external contributors. |

## 🔒 Policy and governance

| Document | What's inside |
|---|---|
| [`../README.md`](../README.md) | Install, features, high-level overview. |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | How to contribute, PR guidelines, out-of-scope changes. |
| [`../SECURITY.md`](../SECURITY.md) | Vulnerability disclosure, threat model, scope. |
| [`../LICENSE`](../LICENSE) | Apache-2.0 license text. |
| [`../NOTICE`](../NOTICE) | Trademark reservation and brand-asset terms. |
| [`../CHANGELOG.md`](../CHANGELOG.md) | Release notes. |

## 💡 Common tasks

- **I want to fix a broken adapter** → [`adapters.md#fixing-a-broken-adapter`](adapters.md#fixing-a-broken-adapter)
- **I want to add a new job board** → [`adapters.md#write-your-first-adapter-in-10-minutes`](adapters.md#write-your-first-adapter-in-10-minutes)
- **I want to debug the service worker** → [`development.md#debugging`](development.md#debugging)
- **I found a security issue** → [`../SECURITY.md`](../SECURITY.md)
- **I want to fork this** → [`faq.md#forks-and-self-hosting`](faq.md#forks-and-self-hosting)
