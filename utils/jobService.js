const { URL } = require('url');

/**
 * Fetch job listings from configured providers.
 * Supports Indeed, LinkedIn or any internal career service
 * defined via environment variables.
 *
 * Set env vars:
 *  INDEED_API_URL, LINKEDIN_API_URL, CAREER_SERVICE_URL
 *  and optional *_API_KEY for auth headers.
 *
 * Returned job objects normalized to:
 *  { title, company, location, url }
 */
async function fetchJobs(query = '') {
  const providers = [
    {
      name: 'indeed',
      url: process.env.INDEED_API_URL,
      key: process.env.INDEED_API_KEY
    },
    {
      name: 'linkedin',
      url: process.env.LINKEDIN_API_URL,
      key: process.env.LINKEDIN_API_KEY
    },
    {
      name: 'career',
      url: process.env.CAREER_SERVICE_URL,
      key: process.env.CAREER_SERVICE_KEY
    }
  ];

  const results = [];

  for (const p of providers) {
    if (!p.url) continue; // provider not configured
    try {
      const apiUrl = new URL(p.url);
      if (query) apiUrl.searchParams.set('q', query);
      const headers = {};
      if (p.key) headers['Authorization'] = `Bearer ${p.key}`;
      const res = await fetch(apiUrl, { headers });
      if (!res.ok) throw new Error(`${p.name} responded ${res.status}`);
      let data = await res.json();
      if (data.jobs && Array.isArray(data.jobs)) data = data.jobs;
      if (!Array.isArray(data)) data = [];
      const norm = data.map(j => ({
        title: j.title || j.jobTitle || '',
        company: j.company || j.companyName || '',
        location: j.location || j.city || '',
        url: j.url || j.jobUrl || j.applyUrl || ''
      }));
      results.push(...norm);
    } catch (err) {
      console.error('Job API error', p.name, err.message);
    }
  }

  return results;
}

module.exports = { fetchJobs };
