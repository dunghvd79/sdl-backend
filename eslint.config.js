const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    {
        ignores: [
            'node_modules/**',
            'public/**',
            'coverage/**',
            'scratch/**',
            '**/*.log',
            'scratch_test_*.js',
            'seed_*.js',
        ],
    },
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
            },
        },
        rules: {
            'no-unused-vars': 'warn',
            'no-undef': 'error',
            'no-dupe-keys': 'error',
            'no-unreachable': 'error',
            eqeqeq: 'error',
            'no-fallthrough': 'error',
            'no-constant-condition': 'error',
            // Downgraded from recommended's "error": existing regexes use
            // harmless-but-unnecessary escapes inside char classes. Keeping as
            // "warn" avoids churning/altering regex logic in this lint-only pass.
            'no-useless-escape': 'warn',
        },
    },
    {
        files: ['tests/**'],
        languageOptions: {
            globals: {
                ...globals.jest,
            },
        },
    },
];
