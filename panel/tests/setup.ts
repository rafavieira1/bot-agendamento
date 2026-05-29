import '@testing-library/jest-dom';
import { vi } from 'vitest';

vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
vi.stubEnv('VITE_PAINEL_WEBHOOK_URL', 'https://example.test/webhook');
