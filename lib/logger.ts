export const logFlightBox = (event: string, data: any = {}) => {
  const payload = {
    timestamp: new Date().toISOString(),
    event,
    ...data
  };
  
  // Console log in dev tools
  console.log(`[FLIGHTBOX] ${event}`, data);
  
  // Save to file in project folder
  fetch('/api/debug', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(() => {
    // Silently fail if API is unavailable
  });
};
