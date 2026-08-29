# Instagram-Style Lightbox Design

## Goal

Redesign the Vue lightbox as an Instagram-style image card with the photo on the left, an interaction panel on the right, and anonymous Contentful-backed likes and comments.

## Approved behavior

- Desktop and tablet use a side-by-side card: image left, interaction panel right.
- Mobile stacks the image above the interaction panel.
- The post identity is fixed as `eyesup_gallery`.
- Existing photo metadata (`id`, `alt`, `location`, and `date`) supplies the post association and caption.
- No share action.
- The panel initially loads five newest comments and offers `Load more` for older comments.
- Comments are immediately visible, immutable after submission, plain text, and limited to 500 characters.
- Likes toggle: one active like per `photoId + ipHash`; clicking again removes it.
- Likes and comments use optimistic updates. A pending comment is displayed as `Posting…`; failed writes roll back and restore the draft.

## Anonymous identity

The browser discovers its public IP through a configurable external IP endpoint, hashes it with Web Crypto, and sends only the hash to Contentful. A deterministic seeded algorithm maps the hash to a randomized username and one pre-generated mascot avatar inspired by the linked `ip-as-logo` style. The same visitor receives the same pseudonymous identity for the same hash.

This identifier is an abuse-prevention/deduplication key, not a secure identity. IP discovery can be blocked or spoofed.

## Contentful model

Interactions use a separate Contentful space and dedicated browser-exposed write token. This intentionally accepts the risk that the token can be extracted and used to modify or delete all content in that interaction space; the main photography space is not exposed to this token.

Content types:

- `photoLike`: `photoId` string, `ipHash` string, `createdAt` datetime.
- `photoComment`: `photoId` string, `ipHash` string, `text` string, `createdAt` datetime, `status` string (`visible` on submission).

The separate space prevents cross-space references, so `photoId` stores the stable gallery Contentful entry ID rather than an image URL.

## Data flow

1. `Gallery` passes the complete `Photo` identity and metadata into `Lightbox`.
2. When the lightbox opens, it resolves the public IP, computes `ipHash`, derives the anonymous name/avatar, and reads the selected photo’s interaction entries.
3. A like updates the local count/state immediately, then creates or deletes the corresponding `photoLike` entry. Failure restores the prior state.
4. A comment is inserted immediately with a temporary `Posting…` state, then creates a `photoComment` entry. Failure removes the temporary item, restores the draft, and shows an inline error.
5. Contentful queries request five comments initially and use skip/limit pagination for older comments.

## Error and accessibility behavior

- Disable the active action while its request is pending.
- Preserve comment input after a failed submission.
- Keep keyboard Escape/left/right navigation and close controls.
- Use labelled buttons, live status/error text, visible focus states, and an accessible comments region.
- Preserve body scroll locking while the lightbox is open.

## Scope

Implementation includes the lightbox, supporting types/services/utilities, configuration, and focused tests. Existing gallery loading, filtering, and photo presentation remain unchanged except for passing the stable photo ID and metadata required by the lightbox.
