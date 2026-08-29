import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

import { createAnonymousIdentity, discoverPublicIp, hashIp } from "@/services/anonymousIdentity";
import {
  createComment,
  createLike,
  deleteLike,
  fetchInteractionSummary,
} from "@/services/interactions";
import type { InteractionComment, InteractionSummary } from "@/types/interactions";
import type { Photo } from "@/types/gallery";
import Lightbox from "../components/Lightbox.vue";

const IP_HASH = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const viewer = { ipHash: IP_HASH, username: "calm-otter-13", avatarUrl: "/mascot.svg" };

vi.mock("@/services/anonymousIdentity", () => ({
  createAnonymousIdentity: vi.fn(),
  discoverPublicIp: vi.fn(),
  hashIp: vi.fn(),
}));

vi.mock("@/services/interactions", () => ({
  createComment: vi.fn(),
  createLike: vi.fn(),
  deleteLike: vi.fn(),
  fetchInteractionSummary: vi.fn(),
}));

const items: Photo[] = [
  {
    id: "photo-1",
    thumbSrc: "/thumb1.jpg",
    src: "/img1.jpg",
    alt: "Photo 1",
    location: "Paris, FR",
    date: "January, 2024",
    type: "portrait",
    category: "Architecture",
  },
  {
    id: "photo-2",
    thumbSrc: "/thumb2.jpg",
    src: "/img2.jpg",
    alt: "Photo 2",
    location: "Tokyo, JP",
    date: "February, 2024",
    type: "landscape",
    category: "Nature",
  },
  {
    id: "photo-3",
    thumbSrc: "/thumb3.jpg",
    src: "/img3.jpg",
    alt: "Photo 3",
    location: "Reykjavik, IS",
    date: "March, 2024",
    type: "square",
    category: "Portrait",
  },
];

const single: Photo[] = [{ ...items[0], id: "single-photo", src: "/img.jpg" }];

function comment(id: string, text = `Comment ${id}`): InteractionComment {
  return {
    id,
    photoId: "photo-1",
    ipHash: IP_HASH,
    text,
    createdAt: `2026-08-29T12:0${id.length}:00.000Z`,
    status: "visible",
  };
}

function makeSummary(overrides: Partial<InteractionSummary> = {}): InteractionSummary {
  return {
    likeCount: 2,
    likedByViewer: false,
    comments: [comment("1"), comment("2"), comment("3"), comment("4"), comment("5")],
    hasMoreComments: true,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function openLightbox(
  props: { items?: Photo[]; modelValue?: boolean; index?: number } = {},
) {
  const wrapper = mount(Lightbox, {
    props: { items: single, modelValue: true, index: 0, ...props },
  });
  await flushPromises();
  return wrapper;
}

describe("Lightbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(discoverPublicIp).mockResolvedValue("203.0.113.42");
    vi.mocked(hashIp).mockResolvedValue(IP_HASH);
    vi.mocked(createAnonymousIdentity).mockReturnValue(viewer);
    vi.mocked(fetchInteractionSummary).mockResolvedValue(makeSummary());
    vi.mocked(createLike).mockResolvedValue("like-new");
    vi.mocked(deleteLike).mockResolvedValue();
    vi.mocked(createComment).mockResolvedValue(comment("new", "Posted comment"));
    document.body.style.overflow = "";
  });

  afterEach(() => {
    document.body.style.overflow = "";
  });

  it("renders the current item image based on index", () => {
    const wrapper = mount(Lightbox, {
      props: { items, modelValue: true, index: 1 },
    });
    expect(wrapper.find("img").attributes("src")).toBe("/img2.jpg");
  });

  it("renders the fixed account header, metadata, and five newest comments", async () => {
    const wrapper = await openLightbox({ items, index: 0 });

    expect(wrapper.find('[role="dialog"]').attributes("data-photo-id")).toBe("photo-1");
    expect(wrapper.find("#lightbox-title").text()).toContain("eyesup_gallery");
    expect(wrapper.find('[aria-label="Comments"]').findAll("li")).toHaveLength(5);
    expect(wrapper.text()).toContain("Paris, FR");
    expect(wrapper.text()).toContain("January, 2024");
    expect(wrapper.text()).not.toContain("Share");
    expect(wrapper.text()).not.toContain("Bookmark");
  });

  it("bounds the mobile interaction card to the viewport while retaining desktop sizing", () => {
    const wrapper = mount(Lightbox, {
      props: { items: single, modelValue: true, index: 0 },
    });

    const card = wrapper.find('[role="dialog"] > div');
    expect(card.classes()).toContain("max-h-[calc(100dvh-1rem)]");
    expect(card.classes()).toContain("md:max-h-[calc(100vh-4rem)]");
  });

  it("loads a fresh summary and photo metadata after navigation", async () => {
    const wrapper = await openLightbox({ items, index: 0 });
    await wrapper.find('[aria-label="Next image"]').trigger("click");
    await flushPromises();

    expect(wrapper.find("img").attributes("src")).toBe("/img2.jpg");
    expect(wrapper.find('[role="dialog"]').attributes("data-photo-id")).toBe("photo-2");
    expect(wrapper.text()).toContain("Tokyo, JP");
    expect(vi.mocked(fetchInteractionSummary)).toHaveBeenLastCalledWith("photo-2", IP_HASH);
  });

  it("falls back to default alt when item has no alt", () => {
    const wrapper = mount(Lightbox, {
      props: { items: [{ ...single[0], alt: "" }], modelValue: true, index: 0 },
    });
    expect(wrapper.find("img").attributes("alt")).toBe("Expanded gallery image");
  });

  it("emits update:index on next and previous button clicks", async () => {
    const nextWrapper = mount(Lightbox, {
      props: { items, modelValue: true, index: 0 },
    });
    await nextWrapper.find('[aria-label="Next image"]').trigger("click");
    expect(nextWrapper.emitted("update:index")?.[0]?.[0]).toBe(1);

    const prevWrapper = mount(Lightbox, {
      props: { items, modelValue: true, index: 1 },
    });
    await prevWrapper.find('[aria-label="Previous image"]').trigger("click");
    expect(prevWrapper.emitted("update:index")?.[0]?.[0]).toBe(0);
  });

  it("wraps navigation and hides controls for a single item", async () => {
    const nextWrapper = mount(Lightbox, {
      props: { items, modelValue: true, index: 2 },
    });
    await nextWrapper.find('[aria-label="Next image"]').trigger("click");
    expect(nextWrapper.emitted("update:index")?.[0]?.[0]).toBe(0);

    const singleWrapper = mount(Lightbox, {
      props: { items: single, modelValue: true, index: 0 },
    });
    expect(singleWrapper.find('[aria-label="Next image"]').exists()).toBe(false);
    expect(singleWrapper.find('[aria-label="Previous image"]').exists()).toBe(false);
  });

  it("closes on Escape and restores the previous body overflow", async () => {
    document.body.style.overflow = "scroll";
    const wrapper = mount(Lightbox, {
      props: { items: single, modelValue: false, index: 0 },
    });
    await wrapper.setProps({ modelValue: true });
    expect(document.body.style.overflow).toBe("hidden");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(wrapper.emitted("update:modelValue")?.[0]?.[0]).toBe(false);
    await wrapper.setProps({ modelValue: false });
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("restores body overflow when destroyed while open", () => {
    document.body.style.overflow = "clip";
    const wrapper = mount(Lightbox, {
      props: { items: single, modelValue: true, index: 0 },
    });
    expect(document.body.style.overflow).toBe("hidden");
    wrapper.unmount();
    expect(document.body.style.overflow).toBe("clip");
  });

  it("optimistically likes and settles a successful like", async () => {
    const request = deferred<string>();
    vi.mocked(createLike).mockReturnValue(request.promise);
    const wrapper = await openLightbox();
    const likeButton = wrapper.find('[aria-label="Like photo"]');

    await likeButton.trigger("click");
    expect(likeButton.text()).toContain("3 likes");
    expect(likeButton.attributes("aria-busy")).toBe("true");
    expect(likeButton.attributes("disabled")).toBeDefined();

    request.resolve("like-created");
    await flushPromises();
    expect(vi.mocked(createLike)).toHaveBeenCalledWith("single-photo", IP_HASH);
    expect(wrapper.find('[aria-label="Unlike photo"]').exists()).toBe(true);
  });

  it("rolls back a failed optimistic like and exposes an error", async () => {
    vi.mocked(createLike).mockRejectedValue(new Error("Like failed"));
    const wrapper = await openLightbox();
    await wrapper.find('[aria-label="Like photo"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[aria-label="Like photo"]').text()).toContain("2 likes");
    expect(wrapper.find('[role="alert"]').text()).toContain("Like failed");
  });

  it("optimistically posts a comment and replaces Posting state on success", async () => {
    const request = deferred<InteractionComment>();
    vi.mocked(createComment).mockReturnValue(request.promise);
    const wrapper = await openLightbox();
    const input = wrapper.find("textarea");
    await input.setValue("  New comment  ");
    await wrapper.find("form").trigger("submit");

    expect(wrapper.text()).toContain("New comment");
    expect(wrapper.text()).toContain("Posting…");
    expect(wrapper.find('button[type="submit"]').attributes("disabled")).toBeDefined();

    request.resolve(comment("created", "New comment"));
    await flushPromises();
    expect(wrapper.text()).not.toContain("Posting…");
    expect(vi.mocked(createComment)).toHaveBeenCalledWith("single-photo", IP_HASH, "New comment");
  });

  it("restores a failed comment draft and removes its provisional item", async () => {
    vi.mocked(createComment).mockRejectedValue(new Error("Comment failed"));
    const wrapper = await openLightbox();
    const input = wrapper.find("textarea");
    await input.setValue("Draft to restore");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect((input.element as HTMLTextAreaElement).value).toBe("Draft to restore");
    expect(wrapper.text()).not.toContain("Posting…");
    expect(wrapper.find('[role="alert"]').text()).toContain("Comment failed");
  });

  it("validates empty and overlong comments without writing", async () => {
    const wrapper = await openLightbox();
    const input = wrapper.find("textarea");
    await wrapper.find("form").trigger("submit");
    expect(wrapper.find('[role="alert"]').text()).toContain("Enter a comment");
    expect(vi.mocked(createComment)).not.toHaveBeenCalled();

    await input.setValue("a".repeat(501));
    await wrapper.find("form").trigger("submit");
    expect(wrapper.find('[role="alert"]').text()).toContain("500 characters");
    expect(vi.mocked(createComment)).not.toHaveBeenCalled();
  });

  it("loads older comments with five-item pagination", async () => {
    const olderComments = [comment("6", "Older comment"), comment("7")];
    const nextPage = deferred<InteractionSummary>();
    vi.mocked(fetchInteractionSummary)
      .mockResolvedValueOnce(makeSummary())
      .mockReturnValueOnce(nextPage.promise);
    const wrapper = await openLightbox();
    const loadMore = wrapper.findAll("button").find((button) => button.text() === "Load more");
    if (!loadMore) throw new Error("Load more button was not rendered.");

    await loadMore.trigger("click");
    expect(loadMore.text()).toBe("Loading…");
    expect(loadMore.attributes("disabled")).toBeDefined();
    expect(vi.mocked(fetchInteractionSummary)).toHaveBeenLastCalledWith("single-photo", IP_HASH, 5);

    nextPage.resolve(makeSummary({ comments: olderComments, hasMoreComments: false }));
    await flushPromises();
    expect(wrapper.text()).toContain("Older comment");
    expect(wrapper.findAll("button").some((button) => button.text() === "Load more")).toBe(false);
  });

  it("shows identity and interaction errors accessibly when loading fails", async () => {
    vi.mocked(discoverPublicIp).mockRejectedValue(new Error("IP unavailable"));
    const wrapper = await openLightbox();

    expect(wrapper.find('[role="alert"]').text()).toContain("IP unavailable");
    expect(wrapper.find('[aria-label="Like photo"]').attributes("disabled")).toBeDefined();
    expect(wrapper.find("textarea").attributes("disabled")).toBeDefined();
  });

  it("prevents native form submission", async () => {
    const wrapper = await openLightbox();
    const event = new Event("submit", { cancelable: true });

    wrapper.find("form").element.dispatchEvent(event);
    await flushPromises();

    expect(event.defaultPrevented).toBe(true);
  });

  it("keeps like and comment writes pending independently", async () => {
    const likeRequest = deferred<string>();
    const commentRequest = deferred<InteractionComment>();
    vi.mocked(createLike).mockReturnValue(likeRequest.promise);
    vi.mocked(createComment).mockReturnValue(commentRequest.promise);
    const wrapper = await openLightbox();

    await wrapper.find('[aria-label="Like photo"]').trigger("click");
    await wrapper.find("textarea").setValue("Independent comment");
    await wrapper.find("form").trigger("submit");

    expect(wrapper.find('[aria-label="Unlike photo"]').attributes("disabled")).toBeDefined();
    expect(wrapper.find('button[type="submit"]').attributes("disabled")).toBeDefined();

    likeRequest.resolve("like-created");
    await flushPromises();
    expect(wrapper.find('[aria-label="Unlike photo"]').attributes("disabled")).toBeUndefined();
    expect(wrapper.find('button[type="submit"]').attributes("disabled")).toBeDefined();

    commentRequest.resolve(comment("created", "Independent comment"));
    await flushPromises();
    expect(wrapper.find('button[type="submit"]').attributes("disabled")).toBeUndefined();
  });

  it("ignores a stale comment failure after navigation", async () => {
    const commentRequest = deferred<InteractionComment>();
    vi.mocked(createComment).mockReturnValue(commentRequest.promise);
    const wrapper = await openLightbox({ items, index: 0 });

    await wrapper.find("textarea").setValue("Stale comment");
    await wrapper.find("form").trigger("submit");
    await wrapper.find('[aria-label="Next image"]').trigger("click");
    await flushPromises();

    commentRequest.reject(new Error("Stale comment failure"));
    await flushPromises();

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.find("textarea").element.value).toBe("");
    expect(wrapper.find('[aria-label="Comments"]').findAll("li")).toHaveLength(5);
  });

  it("ignores stale writes after closing and reopening the same photo", async () => {
    const commentRequest = deferred<InteractionComment>();
    vi.mocked(createComment).mockReturnValue(commentRequest.promise);
    const wrapper = await openLightbox();

    await wrapper.find("textarea").setValue("Original draft");
    await wrapper.find("form").trigger("submit");
    await wrapper.setProps({ modelValue: false });
    await wrapper.setProps({ modelValue: true });
    await flushPromises();
    expect(wrapper.find("textarea").attributes("disabled")).toBeDefined();

    commentRequest.reject(new Error("Stale comment failure"));
    await flushPromises();

    expect(wrapper.find("textarea").element.value).toBe("");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);

  });

  it("keeps controls disabled while stale writes remain in flight after navigation", async () => {
    const likeRequest = deferred<string>();
    const commentRequest = deferred<InteractionComment>();
    vi.mocked(createLike).mockReturnValue(likeRequest.promise);
    vi.mocked(createComment).mockReturnValue(commentRequest.promise);
    const wrapper = await openLightbox({ items, index: 0 });

    await wrapper.find('[aria-label="Like photo"]').trigger("click");
    await wrapper.find("textarea").setValue("Stale comment");
    await wrapper.find("form").trigger("submit");
    await wrapper.find('[aria-label="Next image"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[aria-label="Like photo"]').attributes("disabled")).toBeDefined();
    expect(wrapper.find("textarea").attributes("disabled")).toBeDefined();
    expect(wrapper.find('button[type="submit"]').attributes("disabled")).toBeDefined();

    likeRequest.resolve("stale-like");
    commentRequest.resolve(comment("stale-comment", "Stale comment"));
    await flushPromises();
  });

  it("does not start duplicate like or comment writes after close/reopen until originals settle", async () => {
    const likeRequest = deferred<string>();
    const commentRequest = deferred<InteractionComment>();
    vi.mocked(createLike)
      .mockReturnValueOnce(likeRequest.promise)
      .mockResolvedValue("fresh-like");
    vi.mocked(createComment)
      .mockReturnValueOnce(commentRequest.promise)
      .mockResolvedValue(comment("fresh-comment", "Current comment"));
    const wrapper = await openLightbox();

    await wrapper.find('[aria-label="Like photo"]').trigger("click");
    await wrapper.find("textarea").setValue("Original comment");
    await wrapper.find("form").trigger("submit");
    expect(vi.mocked(createLike)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createComment)).toHaveBeenCalledTimes(1);

    await wrapper.setProps({ modelValue: false });
    await wrapper.setProps({ modelValue: true });
    await flushPromises();

    await wrapper.find('[aria-label="Like photo"]').trigger("click");
    await wrapper.find("textarea").setValue("Duplicate comment");
    await wrapper.find("form").trigger("submit");
    expect(vi.mocked(createLike)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createComment)).toHaveBeenCalledTimes(1);

    likeRequest.resolve("stale-like");
    commentRequest.reject(new Error("stale comment failure"));
    await flushPromises();

    await wrapper.find('[aria-label="Like photo"]').trigger("click");
    await wrapper.find("textarea").setValue("After settle");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(vi.mocked(createLike)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(createComment)).toHaveBeenCalledTimes(2);
  });

  it("does not let a stale like completion replace a fresh like entry", async () => {
    const likeRequest = deferred<string>();
    vi.mocked(createLike).mockReturnValue(likeRequest.promise);
    vi.mocked(fetchInteractionSummary)
      .mockResolvedValueOnce(makeSummary({ likedByViewer: false }))
      .mockResolvedValueOnce(makeSummary({ likedByViewer: true, viewerLikeId: "fresh-like" }));
    const wrapper = await openLightbox();

    await wrapper.find('[aria-label="Like photo"]').trigger("click");
    await wrapper.setProps({ modelValue: false });
    await wrapper.setProps({ modelValue: true });
    await flushPromises();

    likeRequest.resolve("stale-like");
    await flushPromises();
    await wrapper.find('[aria-label="Unlike photo"]').trigger("click");
    await flushPromises();

    expect(vi.mocked(deleteLike)).toHaveBeenCalledWith("fresh-like");
  });

  it("traps focus in the dialog and restores focus to its opener", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const wrapper = mount(Lightbox, {
      attachTo: document.body,
      props: { items: single, modelValue: false, index: 0 },
    });

    await wrapper.setProps({ modelValue: true });
    await flushPromises();
    const closeButton = wrapper.find('[aria-label="Close lightbox"]');
    const submitButton = wrapper.find('button[type="submit"]');
    expect(document.activeElement).toBe(closeButton.element);

    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    expect(document.activeElement).toBe(closeButton.element);

    submitButton.element.focus();
    submitButton.element.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(document.activeElement).toBe(closeButton.element);

    await wrapper.setProps({ modelValue: false });
    await flushPromises();
    expect(document.activeElement).toBe(opener);

    wrapper.unmount();
    opener.remove();
    outside.remove();
  });

});
