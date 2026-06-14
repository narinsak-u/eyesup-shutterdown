import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import GalleryItem from '../components/GalleryItem.vue'

describe('GalleryItem', () => {
  const baseProps = {
    src: 'https://example.com/photo.jpg',
    thumbSrc: 'https://example.com/photo.jpg?w=600&fit=thumb&fm=webp',
    alt: 'A test photo',
    location: 'Paris, FR',
    date: 'May, 2026',
    type: 'landscape' as const,
  }

  it('renders the thumbSrc as image src', () => {
    const wrapper = mount(GalleryItem as any, { props: baseProps })
    const img = wrapper.find('img')
    expect(img.attributes('src')).toBe(baseProps.thumbSrc)
  })

  it('renders location and date text', () => {
    const wrapper = mount(GalleryItem as any, { props: baseProps })
    expect(wrapper.text()).toContain('Paris, FR')
    expect(wrapper.text()).toContain('May, 2026')
  })
})
