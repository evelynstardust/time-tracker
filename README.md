# ShowClock v1

A phone-first show-day crew time tracker.

## What it does

- Crew check-in cards
- 15-minute break flag after 2 hours and missed after 3 hours
- Lunch due by 5 hours
- All-day hand detection
- Bulk actions for selected or visible crew
- Export CSV
- Copy end-of-night summary
- Works offline after first load when hosted over HTTPS
- Can be installed to iPhone/Android home screen as a PWA

## How to run locally

Open `index.html` in a browser for testing.

For installable PWA behavior, host the folder on HTTPS, for example:
- Netlify
- Vercel
- GitHub Pages
- A small internal web server

## CSV import format

Use Tools > Import CSV and paste rows in this format:

Name, Position, Call Time, Group

Example:

Jane Smith, Stagehand Grip, 08:45 am, Stagehands

## Notes

This is not legal advice or payroll certification. It is a show-day tracking aid.