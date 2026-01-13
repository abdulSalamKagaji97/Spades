def compute_score(estimate, wins):
    if wins >= estimate:
        return (estimate * 10) + (wins - estimate)
    return -(estimate * 10) + wins
