import {
  merge,
  Observable,
  Subject,
  Subscription,
  ReplaySubject,
  BehaviorSubject,
  zip,
  of
} from 'rxjs'
import { map, scan, share, tap, withLatestFrom, shareReplay, filter } from 'rxjs/operators'

type AnyAction = {
  type: string
}
type Reducer<S extends object, A extends AnyAction> = (state: S, action: A) => S
export type Middleware<S extends object, A extends AnyAction> = (
  action$: Observable<A>,
  state$: Observable<S>
) => Observable<A>

export const createRxReducer = <S extends object, A extends AnyAction>(
  reducer: Reducer<S, A>,
  initialState: S,
  middlewares: Middleware<S, A>[]
) => {
  const state$ = new Observable<S>(observer => {
    let latestAction: A | null = null
    const middlewareActionSubject = new ReplaySubject<A>(Infinity)
    const innerState$ = merge(
      middlewareActionSubject.pipe(
        tap(action => {
          latestAction = action
        }),
        scan(reducer, initialState)
      ),
      of(initialState)
    ).pipe(shareReplay({ refCount: true, bufferSize: 1 }))

    const instantiatedMiddlewares = middlewares.map(middleware => {
      return middleware(
        innerState$.pipe(
          map(() => {
            return latestAction
          }),
          filter((a): a is A => !!a),
          share()
        ),
        innerState$
      )
    })

    const stateSubscription = innerState$.subscribe({
      next: state => {
        observer.next(state)
      },
      error: err => {
        observer.error(err)
      },
      complete: () => {
        observer.complete()
      }
    })

    const middlewareSubscription = merge(...instantiatedMiddlewares).subscribe({
      next: action => {
        middlewareActionSubject.next(action)
      },
      error: err => {
        middlewareActionSubject.error(err)
      },
      complete: () => {
        middlewareActionSubject.complete()
      }
    })

    return () => {
      middlewareSubscription.unsubscribe()
      stateSubscription.unsubscribe()
    }
  })

  return state$
}
