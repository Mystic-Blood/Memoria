/** Tailwind classes for a memory-status badge, shared by the memory list and detail views. */
export function statusBadgeClass(status: string): string {
  switch (status) {
    case 'active': return 'bg-success-soft text-success border-success-line'
    case 'pending': return 'bg-warning-soft text-warning border-warning-line'
    case 'superseded': return 'bg-subtle text-muted border-line'
    case 'deleted': return 'bg-danger-soft text-danger border-danger-line'
    case 'expired': return 'bg-subtle text-faint border-line'
    default: return 'bg-accent-soft text-accent-text border-accent-line'
  }
}
