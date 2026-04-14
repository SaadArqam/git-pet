<div align="center">

```
 ██████╗ ██╗████████╗    ██████╗ ███████╗████████╗
██╔════╝ ██║╚══██╔══╝    ██╔══██╗██╔════╝╚══██╔══╝
██║  ███╗██║   ██║       ██████╔╝█████╗     ██║   
██║   ██║██║   ██║       ██╔═══╝ ██╔══╝     ██║   
╚██████╔╝██║   ██║       ██║     ███████╗   ██║   
 ╚═════╝ ╚═╝   ╚═╝       ╚═╝     ╚══════╝   ╚═╝   
```

# 🤝 Contributing to Git-Pet

First off, thanks for taking the time to contribute! 🎉

Git-Pet is a living experiment, and it grows through the collective creativity of the developer community. Whether you're fixing a bug, suggesting a feature, or just improving the code quality, your help is greatly appreciated.

</div>

---

## 🚀 Getting Started

To get started with development, follow these steps:

### 1. Fork and Clone
1. **Fork** the repository to your own GitHub account.
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/git-pet.git
   cd git-pet
   ```

### 2. Install Dependencies
We use `npm` for package management. Git-Pet is a monorepo powered by Turbo.
```bash
npm install
```

### 3. Environment Setup
Refer to the [README.md](README.md) for detailed environment variable setup. You'll primarily need:
- **GitHub OAuth Credentials** (Client ID & Secret)
- **Upstash Redis** (for persistence)
- **NextAuth Secret**

### 4. Run Locally
Start the development server:
```bash
npm run dev
```

---

## 🧠 How to Contribute

There are many ways to help Git-Pet grow. Here are a few paths you can take:

### 🛠️ Bug Fixes
- Check the **Issues** tab for any open bugs.
- If you find a new bug, please open an issue first to discuss it.
- **Comment** on an issue before you start working on it so others know it's being handled.

### ✨ Feature Additions
We're always looking for cool new features! Some ideas:
- **Interaction Animations**: Adding more life to the pets.
- **World Elements**: New zones, trees, or hidden secrets.
- **Multiplayer Optimizations**: Making the world feel even smoother.
- **Identity Systems**: More ways to map GitHub data to pet behavior.

### 🎨 UX & UI Polish
- Smoothing out movement interpolation.
- Improving the HUD and interaction menus.
- Adding feedback systems (particles, sounds, visual cues).

---

## 📌 Contribution Guidelines

To keep the codebase maintainable and the project moving forward, please follow these guidelines:

> [!IMPORTANT]
> **Keep Changes Focused:** Small, modular PRs are much easier to review and merge than massive refactors.

- **Follow Existing Patterns:** Stick to the established Three.js + React patterns used in the project.
- **Avoid Large Refactors:** Unless previously discussed in an issue, keep your changes scoped to the feature or fix.
- **Test Your Changes:** Ensure your changes work across different screen sizes and don't break existing multiplayer functionality.
- **Documentation:** If you add a new system, please provide a brief description in your PR.

---

## 💬 Discussions & Communication

If you have questions or want to brainstorm an idea:
- **Open an Issue:** This is the best place for feature requests and bug reports.
- **Ask Early:** If you're unsure about an implementation detail, ask in an issue or PR comment before spending too much time on it.

---

## ⭐ Final Note

Even small improvements are valuable — don’t hesitate to contribute! Every PR helps make the world of Git-Pet a little more alive.

**Happy coding!** 🐾
