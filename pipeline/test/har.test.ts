import { describe, expect, it } from 'vitest'
import { extractJsonResponses } from '../src/scrapers/har.js'

const har = { log: { entries: [
  { request: { url: 'https://api.fix-price.kz/buyer/v1/product/in/x?page=1' }, response: { status: 200, content: { mimeType: 'application/json', text: '[{"id":1}]' } } },
  { request: { url: 'https://api.fix-price.kz/buyer/v1/product/in/x?page=2' }, response: { status: 200, content: { mimeType: 'application/json', text: 'eyJpZCI6Mn0=', encoding: 'base64' } } },
  { request: { url: 'https://fix-price.kz/logo.svg' }, response: { status: 200, content: { mimeType: 'image/svg+xml', text: '<svg/>' } } },
  { request: { url: 'https://api.fix-price.kz/buyer/v1/product/in/x?page=3' }, response: { status: 500, content: { mimeType: 'application/json', text: '{}' } } },
] } }

describe('har', () => {
  it('returns parsed JSON bodies of successful matching requests, decoding base64', () => {
    expect(extractJsonResponses(har, /\/product\/in\//)).toEqual([[{ id: 1 }], { id: 2 }])
  })
})
