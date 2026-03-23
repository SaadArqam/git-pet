export const USER_STATS_QUERY = `
  query UserStats($login: String!) {
    user(login: $login) {
      login
      name
      avatarUrl
      createdAt
      repositories(
        first: 100
        ownerAffiliations: OWNER
        orderBy: { field: STARGAZERS, direction: DESC }
      ) {
        totalCount
        nodes {
          name
          stargazerCount
          primaryLanguage { name }
          updatedAt
        }
      }
      contributionsCollection {
        totalCommitContributions
        contributionCalendar {
          weeks {
            contributionDays {
              contributionCount
              date
            }
          }
        }
        pullRequestContributionsByRepository {
          contributions { totalCount }
        }
      }
    }
  }
`;