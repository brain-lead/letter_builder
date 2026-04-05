# Email Brand Swap — Complete Process Documentation

## What We Did
Converted a SoFi HTML email into an OneDrive HTML email.
The result looks like a real OneDrive notification while keeping the entire
SoFi HTML structure, CSS, fonts, footer, tracking links, and legal text intact.

---

## The Core Insight

An HTML email has 4 zones:

```
┌─────────────────────────────────────────┐
│  ZONE 1: <head>                         │  ← NEVER TOUCH
│  CSS, fonts, media queries, scripts     │
├─────────────────────────────────────────┤
│  ZONE 2: Header bar                     │  ← Change: bgcolor + logo alt
│  Brand color + logo image               │
├─────────────────────────────────────────┤
│  ZONE 3: Body content                   │  ← Change: text only
│  Greeting, paragraphs, button, banner   │
├─────────────────────────────────────────┤
│  ZONE 4: Footer                         │  ← NEVER TOUCH
│  Legal, links, copyright, address       │
└─────────────────────────────────────────┘
```

**Rule:** Only change text between tags and brand colors. Never touch structure.

---

## Step-by-Step Process

### Step 1 — Read the target image (Vision AI)
Look at the image and extract:
- Brand name: "OneDrive"
- Brand primary color: #0078D4 (Microsoft blue)
- Body text line 1: "A file has been shared with jvijums@2026usagames.org."
- Body text line 2: "All Signees have signed this document."
- Body text line 3: "This notification was sent from your One-drive environment."
- Button text: "Review Files"
- Banner/notice text: "Confidential information - This fax and any attachments..."

### Step 2 — Identify what to change in the source HTML
Scan the source HTML for:
1. `<title>` tag → change brand name
2. JSON-LD schema `"name"` field → change brand name
3. JSON-LD schema `"logo"` URL → change to new brand logo URL
4. Header table `bgcolor` and `style="background-color:..."` → change to brand color
5. Logo `<img>` `alt` attribute → change brand name
6. Header link text (e.g. "Log in ›") → change to match image
7. Body `<td>` paragraph text → replace with image text
8. Button `<a>` text → replace with image button text
9. Second body paragraph → clear or replace
10. Promo/banner `<td>` text → replace with image banner text
11. Dark footer bar `bgcolor` → change to brand color

### Step 3 — Identify what NEVER changes
- All `<head>` content (CSS, @font-face, @import, media queries)
- All table structure (width, cellpadding, cellspacing, border, align)
- All inline styles EXCEPT bgcolor/background-color on brand-colored tables
- All `href` link URLs (tracking links stay intact)
- All `<img>` src URLs (logo image src stays — only alt text changes)
- All footer content (legal text, unsubscribe, address, copyright)
- All tracking pixel `<img>` at bottom of body

### Step 4 — Apply changes (find-and-replace, no AI needed)

| # | Find | Replace | Why |
|---|------|---------|-----|
| 1 | `<title>SoFi</title>` | `<title>OneDrive</title>` | Page title |
| 2 | `"name": "SoFi"` | `"name": "OneDrive"` | JSON-LD schema |
| 3 | SoFi logo URL in JSON-LD | OneDrive logo URL | Schema logo |
| 4 | `bgcolor="#00A2C7"` on header table | `bgcolor="#0078D4"` | Brand color |
| 5 | `style="background-color: #00A2C7"` on header | `style="background-color: #0078D4"` | Brand color |
| 6 | `alt="SoFi"` on logo img | `alt="OneDrive"` | Logo alt text |
| 7 | `>Log in ›</a>` | `>Review Files</a>` | Header link text |
| 8 | Body paragraph text (Hi Paula... statement...) | New body text from image | Body content |
| 9 | Button text `>View your statement</a>` | `>Review Files</a>` | Button label |
| 10 | Second body paragraph (SoFi app... Thanks...) | Empty or new text | Body content |
| 11 | Promo banner text (Switch your deposit...) | Confidential notice text | Banner content |
| 12 | `bgcolor="#D8D7DF"` banner (had wrong color) | `bgcolor="#D8D7DF"` (fixed) | Banner bg fix |
| 13 | `bgcolor="#201747"` dark footer bar | `bgcolor="#0078D4"` | Brand color |
| 14 | `style="background-color: #201747"` | `style="background-color: #0078D4"` | Brand color |

**Total changes: 14 targeted replacements**
**Lines changed: ~15 out of ~500+ lines**
**Footer: 0 changes**
**CSS/head: 0 changes**
**Table structure: 0 changes**

---

## How to Implement This in Code

### The Algorithm

```
function brandSwap(sourceHtml, imageDescription):

  1. Parse imageDescription to extract:
     - brandName
     - brandColor (hex)
     - bodyLines[] (array of text lines)
     - buttonText
     - bannerText

  2. Split sourceHtml into zones:
     - head = everything before <body>
     - headerZone = first colored table (has logo + nav link)
     - bodyZone = white tables with main content
     - bannerZone = colored table after body (promo/notice)
     - footerBarZone = dark colored table (contact/download links)
     - footerZone = everything after (legal text, copyright)
     - tail = </body></html>

  3. Apply replacements:
     - In head: replace <title> and JSON-LD name/logo
     - In headerZone: replace bgcolor, alt text, nav link text
     - In bodyZone: replace paragraph text, button text
     - In bannerZone: replace bgcolor (if wrong), replace text
     - In footerBarZone: replace bgcolor only
     - footerZone: UNTOUCHED
     - tail: UNTOUCHED

  4. Stitch back: head + headerZone + bodyZone + bannerZone + footerBarZone + footerZone + tail

  5. Return result
```

### Why This Works Better Than Asking AI to Edit HTML

| Approach | Problem |
|----------|---------|
| AI edits full HTML | Truncates output, changes wrong things, adds CSS junk |
| AI edits body only | Still truncates, misses colors, changes structure |
| **Find-and-replace** | **Deterministic, fast, never truncates, never breaks structure** |

### When AI Is Still Needed

- **Vision step only**: Read the image and extract text/colors as plain text
- AI does NOT touch the HTML at all
- The extracted text is then used as input to the find-and-replace algorithm

### The Two-Model Strategy

```
Image → [Vision Model] → Plain text description
                              ↓
Source HTML + text → [Find-and-Replace Code] → Result HTML
```

- Vision model: LLaMA 4 Scout (Groq) or Claude Sonnet (best for images)
- No "edit model" needed — code does the replacement
- Result is always complete, never truncated, never broken

---

## What the AI Should Extract From the Image

Prompt to vision model:
```
Read this email screenshot. Extract ONLY:
1. Brand/company name (e.g. "OneDrive")
2. Primary brand color as hex (e.g. "#0078D4")
3. Header bar color as hex
4. Button color as hex
5. Every line of body text, numbered
6. Button text
7. Any banner/notice text below the button

Output as JSON:
{
  "brand": "OneDrive",
  "headerColor": "#0078D4",
  "buttonColor": "#0078D4",
  "bodyLines": ["line 1", "line 2", "line 3"],
  "buttonText": "Review Files",
  "bannerText": "Confidential information..."
}
```

---

## Files

- `test.html` — original SoFi email
- `onedrive-result.html` — converted OneDrive email
- Run `diff test.html onedrive-result.html` to see exact changes
