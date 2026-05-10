import nextConfig from 'eslint-config-next'

const config = [
  ...nextConfig,
  {
    rules: {
      'no-console': 'warn',
      'prefer-const': 'error',
      // setState in useEffect is a common pattern for localStorage reads
      'react-hooks/set-state-in-effect': 'warn',
      // exhaustive-deps: warn only, complex components have legitimate exceptions
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
]

export default config
