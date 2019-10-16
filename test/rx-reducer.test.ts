import { fakeSchedulers } from 'rxjs-marbles/jest'
import { createRxReducer } from '../src/rx-reducer'
import { isPlainObject } from 'lodash'
import produce from 'immer'
import { Subject, Observer } from 'rxjs'
import { filter, map } from 'rxjs/operators'

type Dictionary<T> = {
  [k: string]: T
}
type ValueOf<T> = T[keyof T]
type AnyFunction = (...args: any[]) => any
type ActionsType<T extends Dictionary<AnyFunction>> = ValueOf<{ [K in keyof T]: ReturnType<T[K]> }>

const createAction = <T extends string, U extends {}>(type: T, payload?: U) => {
  if (!type) {
    throw new Error('You must provide a type to create a type')
  }
  if (payload && !isPlainObject(payload)) {
    throw new Error('Payload must be an object')
  }
  return {
    type,
    payload: payload || {}
  } as {
    type: T
    payload: U
  }
}

const actions = {
  createItem: () =>
    createAction('CREATE_ITEM', {
      id: 'someId'
    }),
  deleteItem: (id: string) =>
    createAction('DELETE_ITEM', {
      id
    })
}
type Action = ActionsType<typeof actions>
type State = {
  items: { id: string; value: string }[]
}
const initialState: State = {
  items: []
}

const reducer = produce((state: State, action: Action) => {
  switch (action.type) {
    case 'CREATE_ITEM': {
      state.items.push({
        id: action.payload.id,
        value: 'value'
      })
      break
    }
    case 'DELETE_ITEM': {
      const index = state.items.findIndex(({ id }) => id === action.payload.id)
      if (index === -1) {
        console.log('nah')
        throw new Error('Invalid id')
      }
      state.items.splice(index, 1)
      break
    }
  }
}, initialState)

const additionalActions$ = new Subject<Action>()
const dispatch = (action: Action) => {
  additionalActions$.next(action)
}
const state$ = createRxReducer<State, Action>(reducer, initialState, [
  (action$, state$) => {
    return additionalActions$
  },
  (action$, state$) => {
    return action$.pipe(
      filter(({ type }) => type === 'CREATE_ITEM'),
      map(action => {
        return actions.deleteItem(action.payload.id)
      })
    )
  }
])

describe('rx reducer tests', () => {
  beforeEach(() => jest.useFakeTimers())
  it(
    'should work',
    fakeSchedulers(advance => {
      const observer: Observer<State> = {
        next: (state: State) => {
          console.log('@state', JSON.stringify(state, null, 2))
        },
        error: (err: any) => {
          console.log('@error', err)
        },
        complete: () => {
          console.log('@completed')
        }
      }
      const spy = jest.spyOn(observer, 'next')
      state$.subscribe(observer)

      dispatch(actions.createItem())
      advance(500)
      expect(spy).toBeCalledTimes(2)
      expect(spy).toHaveBeenNthCalledWith(1, {
        items: [{ id: 'someId', value: 'value' }]
      })
      expect(spy).toHaveBeenNthCalledWith(2, initialState)
    })
  )
})
