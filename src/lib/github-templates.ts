// A curated set of GitHub's built-in .gitignore templates — exact names as
// GitHub expects them for the `gitignore_template` field. Shared between
// `CreateRepositoryDialog` and the workspace Settings "Repository defaults"
// panel (Feature 10) so the two pickers can never drift out of sync.
export const GITIGNORE_TEMPLATES = [
  "Node",
  "Python",
  "Java",
  "Go",
  "Rust",
  "Swift",
  "C++",
  "C",
  "CSharp",
  "Ruby",
  "PHP",
  "Kotlin",
  "Dart",
  "Unity",
  "Terraform",
];

// A curated set of GitHub's built-in license templates — exact SPDX-style
// ids as GitHub expects them for the `license_template` field.
export const LICENSE_TEMPLATES: { id: string; label: string }[] = [
  { id: "mit", label: "MIT License" },
  { id: "apache-2.0", label: "Apache License 2.0" },
  { id: "gpl-3.0", label: "GNU GPLv3" },
  { id: "bsd-3-clause", label: "BSD 3-Clause" },
  { id: "unlicense", label: "The Unlicense" },
  { id: "mpl-2.0", label: "Mozilla Public License 2.0" },
];
