import { describe, expect, it } from "vitest"

import { linkedPicture, nameOfLink, pageOf } from "./linked-picture"

/** A fetch that answers each link as `answers` has it, and 404 to any other. */
function server(
  answers: Record<string, { type: string; body: string | Uint8Array }>
): { get: typeof fetch; asked: string[] } {
  const asked: string[] = []
  const get = (async (url: string | URL | Request) => {
    const link = String(url)
    asked.push(link)
    const answer = answers[link]
    if (!answer) return new Response("not here", { status: 404 })
    return new Response(answer.body, {
      headers: { "content-type": answer.type },
    })
  }) as typeof fetch
  return { get, asked }
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])

describe("pageOf", () => {
  it("finds the picture a page is shared with, made whole against the page", () => {
    const html = `<html><head>
      <title>Ignored &amp; plain</title>
      <meta property="og:title" content="Braun T3 &amp; more">
      <meta property='og:image' content='/img/t3.jpg?w=1200&amp;q=80'>
      <meta name="twitter:image" content="https://other.example/t.jpg">
    </head></html>`
    expect(pageOf(html, "https://shop.example/radios/t3")).toEqual({
      picture: "https://shop.example/img/t3.jpg?w=1200&q=80",
      title: "Braun T3 & more",
    })
  })

  it("goes by twitter:image, or image_src, where there is no og:image", () => {
    expect(
      pageOf(
        '<meta content="https://cdn.example/a.png" name="twitter:image">',
        "https://a.example/"
      ).picture
    ).toBe("https://cdn.example/a.png")
    expect(
      pageOf(
        '<link rel="image_src" href="//cdn.example/b.png"><title> Just a\n page </title>',
        "https://a.example/"
      )
    ).toEqual({ picture: "https://cdn.example/b.png", title: "Just a page" })
  })

  it("gives no picture where the page names none, or none on the web", () => {
    expect(pageOf("<p>nothing</p>", "https://a.example/")).toEqual({
      picture: null,
      title: null,
    })
    expect(
      pageOf(
        '<meta property="og:image" content="javascript:alert(1)">',
        "https://a.example/"
      ).picture
    ).toBeNull()
  })
})

describe("nameOfLink", () => {
  it("is the last of the link's path, or the site's name", () => {
    expect(nameOfLink("https://a.example/photos/My%20Chair.jpg?x=1")).toBe(
      "My Chair.jpg"
    )
    expect(nameOfLink("https://www.a.example/")).toBe("a.example")
  })
})

describe("linkedPicture", () => {
  it("fetches the picture a link is to", async () => {
    const { get } = server({
      "https://a.example/chair.png": { type: "image/png", body: PNG },
    })
    const linked = await linkedPicture("https://a.example/chair.png", get)
    expect(linked).toMatchObject({ name: "chair.png", mimeType: "image/png" })
    expect(new Uint8Array(linked!.data)).toEqual(PNG)
  })

  it("goes by a picture's file ending where its server says nothing of use", async () => {
    const { get } = server({
      "https://a.example/lamp.webp": {
        type: "application/octet-stream",
        body: PNG,
      },
    })
    expect(
      await linkedPicture("https://a.example/lamp.webp", get)
    ).toMatchObject({ mimeType: "image/webp" })
  })

  it("fetches the picture a page is shared with, named by the page's title", async () => {
    const { get, asked } = server({
      "https://shop.example/t3": {
        type: "text/html; charset=utf-8",
        body: '<meta property="og:title" content="Mr. Rams\' radio"><meta property="og:image" content="/t3.jpg">',
      },
      "https://shop.example/t3.jpg": { type: "image/jpeg", body: PNG },
    })
    expect(await linkedPicture("https://shop.example/t3", get)).toMatchObject({
      name: "Mr. Rams' radio.jpg",
      mimeType: "image/jpeg",
    })
    expect(asked).toEqual([
      "https://shop.example/t3",
      "https://shop.example/t3.jpg",
    ])
  })

  it("is null where there is no picture to be had", async () => {
    const { get } = server({
      "https://a.example/page": { type: "text/html", body: "<p>none</p>" },
      "https://a.example/bad": {
        type: "text/html",
        body: '<meta property="og:image" content="/gone.jpg">',
      },
      "https://a.example/notes.txt": { type: "text/plain", body: "hi" },
    })
    expect(await linkedPicture("https://a.example/page", get)).toBeNull()
    expect(await linkedPicture("https://a.example/bad", get)).toBeNull()
    expect(await linkedPicture("https://a.example/notes.txt", get)).toBeNull()
    expect(await linkedPicture("https://a.example/missing.png", get)).toBeNull()
  })

  it("is null where the link fails to answer", async () => {
    const get = (() => Promise.reject(new Error("offline"))) as typeof fetch
    expect(await linkedPicture("https://a.example/x.png", get)).toBeNull()
  })
})
