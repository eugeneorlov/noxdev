import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PackageManager } from "./projectType.js";

export interface ProjectTypeDefaults {
  name: string;
  test_command: string;
  build_command: string;
  lint_command: string;
}

export interface ProjectFramework {
  framework: string;
  defaults: ProjectTypeDefaults;
}

/**
 * Detects the project framework/type based on package.json dependencies and files
 */
export function detectProjectFramework(repoPath: string, packageManager: PackageManager): ProjectFramework {
  const packageJsonPath = join(repoPath, "package.json");

  // Default fallback
  const defaultFramework: ProjectFramework = {
    framework: "node",
    defaults: {
      name: "Node.js",
      test_command: `${packageManager} test`,
      build_command: `${packageManager} run build`,
      lint_command: `${packageManager} run lint`,
    }
  };

  if (!existsSync(packageJsonPath)) {
    return defaultFramework;
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    const dependencies = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };
    const scripts = packageJson.scripts || {};

    // React projects
    if (dependencies.react) {
      // Vite + React
      if (dependencies.vite) {
        return {
          framework: "react-vite",
          defaults: {
            name: "React + Vite",
            test_command: `${packageManager} test`,
            build_command: `${packageManager} run build`,
            lint_command: scripts.lint ? `${packageManager} run lint` : `${packageManager} exec eslint src`,
          }
        };
      }

      // Next.js
      if (dependencies.next) {
        return {
          framework: "nextjs",
          defaults: {
            name: "Next.js",
            test_command: `${packageManager} test`,
            build_command: `${packageManager} run build`,
            lint_command: `${packageManager} run lint`,
          }
        };
      }

      // Create React App or generic React
      return {
        framework: "react",
        defaults: {
          name: "React",
          test_command: `${packageManager} test`,
          build_command: `${packageManager} run build`,
          lint_command: scripts.lint ? `${packageManager} run lint` : `${packageManager} exec eslint src`,
        }
      };
    }

    // Vue.js projects
    if (dependencies.vue) {
      // Vite + Vue
      if (dependencies.vite) {
        return {
          framework: "vue-vite",
          defaults: {
            name: "Vue + Vite",
            test_command: scripts.test ? `${packageManager} test` : `${packageManager} run test:unit`,
            build_command: `${packageManager} run build`,
            lint_command: scripts.lint ? `${packageManager} run lint` : `${packageManager} exec eslint src`,
          }
        };
      }

      // Nuxt.js
      if (dependencies.nuxt || dependencies["@nuxt/kit"]) {
        return {
          framework: "nuxt",
          defaults: {
            name: "Nuxt.js",
            test_command: `${packageManager} test`,
            build_command: `${packageManager} run build`,
            lint_command: `${packageManager} run lint`,
          }
        };
      }

      // Generic Vue
      return {
        framework: "vue",
        defaults: {
          name: "Vue.js",
          test_command: `${packageManager} test`,
          build_command: `${packageManager} run build`,
          lint_command: scripts.lint ? `${packageManager} run lint` : `${packageManager} exec eslint src`,
        }
      };
    }

    // Angular projects
    if (dependencies["@angular/core"]) {
      return {
        framework: "angular",
        defaults: {
          name: "Angular",
          test_command: `${packageManager} test`,
          build_command: `${packageManager} run build`,
          lint_command: `${packageManager} run lint`,
        }
      };
    }

    // Svelte projects
    if (dependencies.svelte) {
      // SvelteKit
      if (dependencies["@sveltejs/kit"]) {
        return {
          framework: "sveltekit",
          defaults: {
            name: "SvelteKit",
            test_command: `${packageManager} test`,
            build_command: `${packageManager} run build`,
            lint_command: scripts.lint ? `${packageManager} run lint` : `${packageManager} exec eslint src`,
          }
        };
      }

      // Generic Svelte
      return {
        framework: "svelte",
        defaults: {
          name: "Svelte",
          test_command: `${packageManager} test`,
          build_command: `${packageManager} run build`,
          lint_command: scripts.lint ? `${packageManager} run lint` : `${packageManager} exec eslint src`,
        }
      };
    }

    // Express/Node.js server projects
    if (dependencies.express || dependencies.fastify || dependencies.koa) {
      return {
        framework: "node-server",
        defaults: {
          name: "Node.js Server",
          test_command: scripts.test ? `${packageManager} test` : `${packageManager} exec jest`,
          build_command: scripts.build ? `${packageManager} run build` : `${packageManager} exec tsc`,
          lint_command: scripts.lint ? `${packageManager} run lint` : `${packageManager} exec eslint src`,
        }
      };
    }

    // TypeScript projects (check for TypeScript-specific features)
    if (dependencies.typescript || existsSync(join(repoPath, "tsconfig.json"))) {
      return {
        framework: "typescript",
        defaults: {
          name: "TypeScript",
          test_command: scripts.test ? `${packageManager} test` : `${packageManager} exec jest`,
          build_command: scripts.build ? `${packageManager} run build` : `${packageManager} exec tsc`,
          lint_command: scripts.lint ? `${packageManager} run lint` : `${packageManager} exec eslint src && ${packageManager} exec tsc --noEmit`,
        }
      };
    }

    // Vite projects (generic)
    if (dependencies.vite) {
      return {
        framework: "vite",
        defaults: {
          name: "Vite",
          test_command: scripts.test ? `${packageManager} test` : `${packageManager} exec vitest run`,
          build_command: `${packageManager} run build`,
          lint_command: scripts.lint ? `${packageManager} run lint` : `${packageManager} exec eslint src`,
        }
      };
    }

    return defaultFramework;
  } catch (error) {
    return defaultFramework;
  }
}

/**
 * Generates optimized commands based on detected framework and available scripts
 */
export function generateCommands(repoPath: string, packageManager: PackageManager): {
  framework: ProjectFramework;
  commands: {
    test_command: string;
    build_command: string;
    lint_command: string;
  };
} {
  const framework = detectProjectFramework(repoPath, packageManager);
  const packageJsonPath = join(repoPath, "package.json");

  let commands = {
    test_command: framework.defaults.test_command,
    build_command: framework.defaults.build_command,
    lint_command: framework.defaults.lint_command,
  };

  // If package.json exists, check for available scripts and prefer them
  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      const scripts = packageJson.scripts || {};

      // Prefer existing scripts over defaults
      if (scripts.test) {
        commands.test_command = `${packageManager} test`;
      }
      if (scripts.build) {
        commands.build_command = `${packageManager} run build`;
      }
      if (scripts.lint) {
        commands.lint_command = `${packageManager} run lint`;
      }
    } catch (error) {
      // Fallback to framework defaults
    }
  }

  return { framework, commands };
}