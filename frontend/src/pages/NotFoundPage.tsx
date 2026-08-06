import { Link } from 'react-router-dom'
import { buttonClass } from '../components/Button'
import { EmptyState } from '../components/EmptyState'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <EmptyState
        icon={
          <span className="font-mono text-4xl text-foreground-muted">404</span>
        }
        message="This route doesn't exist."
        action={
          <Link to="/" className={buttonClass('ghost', 'md')}>
            Back to Dashboard
          </Link>
        }
      />
    </div>
  )
}
