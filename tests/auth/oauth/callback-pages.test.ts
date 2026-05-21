import { describe, expect, it } from 'vitest';

import { getErrorPage, getSuccessPage } from '../../../src/auth/oauth/callback-pages.js';

describe('getErrorPage', () => {
  it('renders the provided title and message', () => {
    const html = getErrorPage('Auth Failed', 'Invalid credentials');
    expect(html).toContain('<h1>Auth Failed</h1>');
    expect(html).toContain('<p>Invalid credentials</p>');
  });

  it('escapes HTML special characters in the title', () => {
    const malicious = '<script>alert("xss")</script>';
    const html = getErrorPage(malicious, 'message');

    expect(html).not.toContain(malicious);
    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(html).toContain('<h1>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</h1>');
  });

  it('escapes HTML special characters in the message', () => {
    const malicious = '<img src=x onerror=alert(1)>';
    const html = getErrorPage('title', malicious);

    expect(html).not.toContain(malicious);
    expect(html).toContain('<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  });

  it('escapes ampersands', () => {
    const html = getErrorPage('A & B', 'C & D');
    expect(html).toContain('<h1>A &amp; B</h1>');
    expect(html).toContain('<p>C &amp; D</p>');
  });

  it('escapes single quotes', () => {
    const html = getErrorPage("It's broken", "Don't panic");
    expect(html).toContain('<h1>It&#x27;s broken</h1>');
    expect(html).toContain('<p>Don&#x27;t panic</p>');
  });
});

describe('getSuccessPage', () => {
  it('renders the success page', () => {
    const html = getSuccessPage();
    expect(html).toContain('Authentication Successful');
    expect(html).toContain('You can close this window');
  });
});
