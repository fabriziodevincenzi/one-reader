import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const dateField = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value),
  z.string().optional(),
);

const journal = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/journal' }),
  schema: z.object({
    lang: z.string(),
    key: z.string().min(1).optional(),
    slug: z.string().min(1),
    title: z.string(),
    'meta-description': z.string(),
       publishedAt: dateField,
       updatedAt: dateField,
    author: z.string().default('One Reader'),
    readingTime: z.string().default('5 min read'),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
  }),
});

export const collections = { journal };
