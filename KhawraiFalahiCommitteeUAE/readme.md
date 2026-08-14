# Khawrai Falahi Committee (KFC) Member Portal

![KFC Logo](https://livenews.live/KFC/logo.png)

A fully static **member portal** for the **Khawrai Falahi Committee UAE**, built with **HTML, CSS, and Vanilla JavaScript**, deployable on **GitHub Pages**.

This portal provides **member login**, **profile management**, **alerts**, **cabinet info**, **gallery**, and **PDF/Image download features**.

---

## Table of Contents

1. [Features](#features)
2. [Project Structure](#project-structure)
3. [Getting Started](#getting-started)
4. [Usage](#usage)
5. [Deployment on GitHub Pages](#deployment-on-github-pages)
6. [Customization](#customization)
7. [Contributing](#contributing)
8. [License](#license)

---

## Features

* **User Login**: Secure localStorage-based login system.
* **Profile Section**: View personal info, profile photo, and card.
* **Alerts**: Interactive alert cards with **expandable content** and **download as image** feature.
* **Cabinet Members**: Grid display of cabinet members with **expandable info**.
* **Gallery**: Photo gallery with lightbox overlay.
* **Theme Toggle**: Light/Dark mode support.
* **Language Toggle**: English / Urdu support.
* **Responsive Design**: Mobile-first and fully responsive layout.
* **Download Features**:

  * Alert cards → PNG using `html2canvas`
  * Profile cards → PDF (front/back) centered

---

## Project Structure

```
KFC-Portal/
│
├── index.html                  # Main dashboard page
├── message/
│   ├── alerts.html             # Alerts page
│   ├── president.html          # President's message
│   ├── cabinet.html            # Cabinet members page
│   └── viewcard.html           # Member card viewer
│
├── database.html               # Member database
├── message/Gallery/
│   └── gallery.html            # Gallery page
│
├── static/
│   ├── css/
│   │   └── main.css            # Main styles
│   ├── js/
│   │   └── main.js             # Common JS logic
│   ├── fonts/
│   │   └── urdu.ttf            # Urdu font
│   └── images/
│       └── photos/             # Profile & gallery images
│
├── message/alerts.json          # Alerts JSON data
└── README.md
```

---

## Getting Started

### Prerequisites

* Modern web browser (Chrome, Firefox, Edge, Safari)
* Git installed (optional, for cloning repo)
* GitHub account for hosting

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/<your-username>/KFC-Portal.git
cd KFC-Portal
```

2. **Open locally**

Open any HTML page in your browser (e.g., `index.html`) to test locally.

---

## Usage

### Login

1. Click **Sign In** in the top right corner.
2. Enter **username** and **password** (stored in localStorage for demo).
3. Once logged in, your profile info and member card become available.

### View Card

* Click **View Card** in the profile dropdown.
* The card opens in **`viewcard.html`** with encoded member number.

Example:

```
https://livenews.live/KFC/viewcard.html?card=NzQ2LTIxMC0wMTE=
```

### Alerts

* Navigate to `Alerts` page.
* Click any card to **expand details**.
* Use the **share icon** to download as **PNG**.

### Cabinet Members

* Navigate to `Cabinet Members` page.
* Click any member card to **expand info**.

### Theme & Language

* Use **moon icon** to toggle **dark mode**.
* Use **language icon** to toggle **Urdu translation**.

---

## Deployment on GitHub Pages

1. Push your repository to GitHub:

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

2. Go to **Settings → Pages** on GitHub.
3. Select **Branch: main** and folder `/root`.
4. Save → Your site will be live at:

```
https://<your-username>.github.io/KFC-Portal/
```

5. Ensure all relative paths point correctly to `/KFC/...` or adjust URLs for root hosting.

---

## Customization

* **Theme Colors**: Modify `main.css` variables (`--brand`, `--soft-light`, `--soft-dark`)
* **Alerts Data**: Edit `message/alerts.json`
* **Profile & Cabinet Data**: Update `main.js` or add JSON files
* **Font**: Change `urdu.ttf` or update font-face in CSS

---

## Contributing

1. Fork this repository.
2. Create your branch: `git checkout -b feature/new-feature`
3. Commit your changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Create a Pull Request

---

## License

This project is **proprietary** and intended for **Khawrai Falahi Committee internal use**.

> Do not redistribute without permission.
