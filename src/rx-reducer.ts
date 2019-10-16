import { merge, Observable, Subject } from "rxjs";
import { map, scan, share, tap, withLatestFrom } from "rxjs/operators";

type AnyAction = {
  type: string;
};
type Reducer<S extends object, A extends AnyAction> = (
  state: S,
  action: A
) => S;
export type Middleware<S extends object, A extends AnyAction> = (
  action$: Observable<A>,
  state$: Observable<S>
) => Observable<A>;

export const createRxReducer = <S extends object, A extends AnyAction>(
  reducer: Reducer<S, A>,
  initialState: S,
  middlewares: Middleware<S, A>[]
) => {
  const state$ = new Observable<S>(observer => {
    const middlewareActionSubject = new Subject<A>();
    const passedState$ = new Subject<S>();
    const innerState$ = middlewareActionSubject
      .pipe(scan(reducer, initialState))
      .pipe(
        tap(state => {
          passedState$.next(state);
        })
      );

    const hotState$ = innerState$.pipe(share());

    const instantiatedMiddlewares = middlewares.map(middleware => {
      return middleware(
        hotState$.pipe(
          withLatestFrom(middlewareActionSubject),
          map(([state, action]) => {
            return action;
          }),
          share()
        ),
        hotState$
      );
    });

    const middlewareSubscription = merge(...instantiatedMiddlewares).subscribe({
      next: action => {
        middlewareActionSubject.next(action);
      },
      error: err => {
        middlewareActionSubject.error(err);
      },
      complete: () => {
        middlewareActionSubject.complete();
      }
    });
    const stateSubscription = passedState$.subscribe({
      next: state => {
        observer.next(state);
      },
      error: err => {
        observer.error(err);
      },
      complete: () => {
        middlewareActionSubject.complete();
      }
    });

    return () => {
      middlewareSubscription.unsubscribe();
      stateSubscription.unsubscribe();
    };
  });

  return state$;
};
