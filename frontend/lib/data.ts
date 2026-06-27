import { Column } from './types';

export const initialColumns: Column[] = [
  {
    id: 'backlog',
    title: 'Backlog',
    color: '#888888',
    cards: [
      {
        id: 'c1',
        title: 'User authentication flow',
        details: 'Design and implement OAuth2 login with Google and GitHub providers.',
      },
      {
        id: 'c2',
        title: 'Dashboard analytics',
        details: 'Build charts for weekly active users and revenue metrics.',
      },
      {
        id: 'c3',
        title: 'Email notification system',
        details: 'Transactional emails for signup, password reset, and order confirmation.',
      },
    ],
  },
  {
    id: 'in-progress',
    title: 'In Progress',
    color: '#209dd7',
    cards: [
      {
        id: 'c4',
        title: 'API rate limiting',
        details: 'Implement per-user rate limits to prevent abuse and ensure fair usage.',
      },
      {
        id: 'c5',
        title: 'Search indexing',
        details: 'Integrate Elasticsearch for full-text search across products and docs.',
      },
    ],
  },
  {
    id: 'review',
    title: 'Review',
    color: '#ecad0a',
    cards: [
      {
        id: 'c6',
        title: 'Payment gateway integration',
        details: 'Stripe checkout flow for subscriptions and one-time purchases.',
      },
      {
        id: 'c7',
        title: 'Mobile responsive layout',
        details: 'Ensure all pages render correctly on tablets and phones.',
      },
    ],
  },
  {
    id: 'done',
    title: 'Done',
    color: '#22c55e',
    cards: [
      {
        id: 'c8',
        title: 'Project scaffolding',
        details: 'Next.js setup with TypeScript, ESLint, Tailwind and CI pipeline.',
      },
      {
        id: 'c9',
        title: 'Database schema',
        details: 'PostgreSQL schema with migrations for users, products, and orders.',
      },
    ],
  },
  {
    id: 'blocked',
    title: 'Blocked',
    color: '#ef4444',
    cards: [
      {
        id: 'c10',
        title: 'Third-party API contract',
        details: 'Waiting on legal approval for the vendor data-sharing agreement.',
      },
    ],
  },
];
