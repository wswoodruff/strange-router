'use strict';

require('regenerator-runtime/runtime');

const React = require('react');
const { Router } = require('react-router-dom');
const { createMemoryHistory } = require('history');
const Testing = require('@testing-library/react');
const { Routes } = require('.');

const {
    screen,
    render,
    prettyDOM,
    waitFor,
    cleanup
} = Testing;

const {
    debug,
    getByText
} = screen;

const waitTimeout = async (timeout) => await new Promise((res) => setTimeout(res, timeout));

const expectContainerContents = (container, contents) => expect(container.innerHTML).toEqual(contents);
const expectHistoryPathnameEquals = (history, path) => expect(history.location.pathname).toEqual(path);
const expectText = (text) => expect(getByText(text)).toBeDefined();
const expectMissingText = (text) => expect(() => getByText(text)).toThrow();
const waitForText = async (text) => await waitFor(() => expectText(text));
// const waitForMissingText = async (text) => await waitFor(() => expectMissingText(text));

// divs wrapped around text help with selecting it with ex: the 'expectText' helpers
const componentWithChildren = (name) => {

    return function ComponentWithChildren({ children }) {

        return (
            <div>
                <div>{name}</div>
                {children && <div>{children}</div>}
            </div>
        );
    };
};

const renderWithRouter = (route, ui) => {

    // TODO figure out why this is needed. Without this,
    // previously rendered routes will stick around in the 'screen'
    cleanup();

    const history = createMemoryHistory();

    history.push(route);

    if (!ui || !React.isValidElement(ui)) {
        throw new Error('Must pass valid ui element');
    }

    return {
        history,
        ...render(
            ui,
            { wrapper: (props) => <Router {...props} history={history} /> }
        )
    };
};

it('renders without crashing with empty routes', () => {

    renderWithRouter('/', <Routes routes={[]} />);
});

it('renders a simple route', () => {

    renderWithRouter(
        '/',
        <Routes routes={{
            path: '/',
            component: () => 'Root route'
        }} />
    );

    expectText('Root route');
});

it('renders different routes given an array of routes', () => {

    const routes = [
        {
            path: '/one',
            component: () => 'Route one'
        },
        {
            path: '/two',
            component: () => 'Route two'
        }
    ];

    renderWithRouter(
        '/one',
        <Routes routes={routes} />
    );

    expectText('Route one');
    expectMissingText('Route two');

    renderWithRouter(
        '/two',
        <Routes routes={routes} />
    );

    expectMissingText('Route one');
    expectText('Route two');
});

it('passes childRoute as "children" prop', () => {

    const routes = [
        {
            path: '/root',
            component: componentWithChildren('Root route'),
            childRoutes: [
                {
                    path: '/',
                    exact: true,
                    component: () => 'Root route base path'
                },
                {
                    path: '/nested',
                    component: () => 'Nested route'
                }
            ]
        }
    ];

    const { container: firstContainer } = renderWithRouter(
        '/root',
        <Routes routes={routes} />
    );

    expectText('Root route');
    expectMissingText('Nested route');

    expectContainerContents(
        firstContainer,
        '<div><div>Root route</div><div>Root route base path</div></div>'
    );

    const { container: secondContainer } = renderWithRouter(
        '/root/nested',
        <Routes routes={routes} />
    );

    expectText('Root route');
    expectText('Nested route');

    expectContainerContents(
        secondContainer,
        // Building this string requires knowledge of how a
        // 'componentWithChildren' renders its children
        '<div><div>Root route</div><div>Nested route</div></div>'
    );
});

it('renders childRoutes many levels deep', () => {

    const routes = [
        {
            path: '/root',
            component: componentWithChildren('Root route'),
            childRoutes: [
                {
                    path: '/nested-sibling',
                    component: () => 'Nested sibling'
                },
                {
                    path: '/nested',
                    component: componentWithChildren('Nested route'),
                    childRoutes: [
                        {
                            path: '/double',
                            component: componentWithChildren('Double nested'),
                            childRoutes: [
                                {
                                    // Need this here to hit the parent route's fullPath '/root/nested/double'
                                    // Without this it will redirect to '/404'.
                                    path: '/',
                                    component: null
                                },
                                {
                                    path: '/triple',
                                    component: componentWithChildren('Triple nested'),
                                    childRoutes: [
                                        {
                                            path: '/quadruple',
                                            component: componentWithChildren('Quadruple nested'),
                                            childRoutes: [
                                                {
                                                    path: '/quintuple',
                                                    component: () => 'Quintuple nested'
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]
        }
    ];

    renderWithRouter(
        '/root/nested/double',
        <Routes routes={routes} />
    );

    expectText('Root route');
    expectMissingText('Nested sibling');
    expectText('Nested route');
    expectText('Double nested');
    expectMissingText('Triple nested');
    expectMissingText('Quadruple nested');
    expectMissingText('Quintuple nested');

    renderWithRouter(
        '/root/nested/double/triple/quadruple/quintuple',
        <Routes routes={routes} />
    );

    expectText('Root route');
    expectMissingText('Nested sibling');
    expectText('Nested route');
    expectText('Double nested');
    expectText('Triple nested');
    expectText('Quadruple nested');
    expectText('Quintuple nested');
});

it('redirects "to" a fallback route if no other routes match', () => {

    const { history } = renderWithRouter(
        '/bad-route',
        <Routes routes={[
            {
                path: '/',
                component: () => 'Root route',
                exact: true
            },
            {
                path: '/login',
                component: () => 'Login route'
            },
            {
                redirect: { to: '/login' }
            }
        ]} />
    );

    expect(history.location.pathname).toEqual('/login');
});

// it('Redirects to nearest ancestor redirect or "/404" for non-matching paths', () => {

//     const routeConfig = [
//         {
//             path: '/park',
//             component: componentWithChildren('Park route'),
//             childRoutes: [
//                 {
//                     path: '/walk-dog',
//                     component: () => 'Walk dog route'
//                 }
//             ]
//         },
//         {
//             path: '/house',
//             component: componentWithChildren('House route'),
//             childRoutes: [
//                 {
//                     path: '/car',
//                     component: () => 'Car route',
//                     childRoutes: [
//                         {
//                             path: '/portal',
//                             component: 'Portal route'
//                         },
//                         // Redirect to the 'Coin jackpot route'
//                         { redirect: { to: '/house/couch/scary' } }
//                     ]
//                 },
//                 {
//                     path: '/couch',
//                     component: componentWithChildren('Couch route'),
//                     childRoutes: [
//                         {
//                             path: '/scary',
//                             component: componentWithChildren('Scary route'),
//                             childRoutes: [
//                                 {
//                                     path: '/',
//                                     component: () => 'Coin jackpot route'
//                                 },
//                                 {
//                                     path: '/lint-kingdom',
//                                     component: componentWithChildren('Lint kingdom route'),
//                                     childRoutes: [
//                                         {
//                                             path: '/throneroom',
//                                             component: () => 'Throneroom route'
//                                         }
//                                     ]
//                                 },
//                                 {
//                                     path: '/think-i-saw-a-ghost',
//                                     component: componentWithChildren('Think I saw a ghost route'),
//                                     childRoutes: [
//                                         {
//                                             path: '/ok-i-definitely-saw-something-that-time',
//                                             component: () => 'Gettin kinda scared route'
//                                         },
//                                         {
//                                             path: '/no-i-think-it-was-nothing',
//                                             component: componentWithChildren('Gettin kinda scared route'),
//                                             childRoutes: [
//                                                 {
//                                                     path: '/aaaahhhhh',
//                                                     component: () => 'Aaaahhhhh route'
//                                                 }
//                                             ]
//                                         },
//                                         { redirect: { to: '/house/couch/scary/think-i-saw-a-ghost/ok-i-definitely-saw-something-that-time' } }
//                                     ]
//                                 }
//                             ]
//                         }
//                     ]
//                 },
//                 {
//                     path: '/sleep',
//                     component: 'ZzZzzz route'
//                 },
//                 // ^^^ Redirect to this route directly above ^^^
//                 { redirect: { to: '/house/sleep' } }
//             ]
//         },
//         {
//             path: '/404',
//             component: () => '404 route'
//         }
//     ];

//     const testRedirect = (path, redirectPath = '/404') => {

//         const { history } = renderWithRouter(
//             path,
//             <Routes routes={routeConfig} />
//         );

//         expectHistoryPathnameEquals(history, redirectPath);
//     };

//     // Try with '/house/couch/scary/lint-kingdom/throneroom' just to see what's in there
//     renderWithRouter(
//         '/house/couch/scary/lint-kingdom/throneroom',
//         <Routes routes={routeConfig} />
//     );

//     expectText('House route');
//     expectMissingText('Car route');
//     expectText('Couch route');
//     expectText('Scary route');
//     expectMissingText('Cushions route');
//     expectText('Lint kingdom route');
//     expectText('Throneroom route');
//     expectMissingText('Gettin kinda scared route');
//     expectMissingText('Think I saw a ghost route');
//     expectMissingText('Coin jackpot route');

//     testRedirect(
//         '/park/sleep',
//         '/404'
//     );

//     testRedirect(
//         '/park/sleep',
//         '/404'
//     );

//     testRedirect(
//         '/house/secret-stash',
//         '/house/sleep'
//     );

//     testRedirect(
//         '/house/couch/take-a-nap',
//         '/house/sleep'
//     );

//     testRedirect(
//         '/house/couch/take-a-nap/take-another-nap',
//         '/house/sleep'
//     );

//     testRedirect(
//         '/house/couch/take-a-nap/take-another-nap/take-another-nother-nap',
//         '/house/sleep'
//     );

//     testRedirect(
//         '/house/couch/scary/don-a-sword',
//         '/house/sleep'
//     );

//     testRedirect(
//         '/house/couch/scary/lint-kingdom/whats-under-the-hat',
//         '/house/sleep'
//     );

//     testRedirect(
//         '/house/couch/scary/lint-kingdom/throneroom/nobody-is-here',
//         '/house/sleep'
//     );

//     testRedirect(
//         '/house/couch/scary/think-i-saw-a-ghost/wait',
//         '/house/couch/scary/think-i-saw-a-ghost/ok-i-definitely-saw-something-that-time'
//     );

//     testRedirect(
//         '/house/couch/scary/think-i-saw-a-ghost/no-i-think-it-was-nothing/wait-i-heard-something',
//         '/house/couch/scary/think-i-saw-a-ghost/ok-i-definitely-saw-something-that-time'
//     );

//     testRedirect(
//         '/house/car/portal',
//         '/house/car/portal'
//     );

//     testRedirect(
//         '/house/car/portal/vortex',
//         '/house/couch/scary'
//     );
// });

// TODO need to do a redirect for a component that doesn't render it's children...

// it('Internally consolidates routes with path "/"', async () => {

//     const dealHandRoutePreTimeout = 1000;

//     // Let's play some blackjack =P
//     const routeConfig = [
//         {
//             path: '/',
//             component: componentWithChildren('Blackjack route'),
//             childRoutes: [
//                 {
//                     path: '/',
//                     pre: async () => await new Promise((res) => setTimeout(res, dealHandRoutePreTimeout)),
//                     component: () => componentWithChildren('Deal hand route'),
//                     childRoutes: [
//                         {
//                             path: '/',
//                             component: () => componentWithChildren('Double down route'),
//                             childRoutes: [
//                                 {
//                                     path: '/',
//                                     component: () => 'Split cards route'
//                                 }
//                             ]

//                         },
//                         {
//                             path: '/card-details/:id',
//                             component: () => 'Card details route'
//                         }
//                     ]
//                 },
//                 {
//                     path: '/cards',
//                     component: componentWithChildren('Cards route'),
//                     childRoutes: [
//                         {
//                             path: '/card-details/:id',
//                             component: () => 'Card details route'
//                         }
//                     ]
//                 }
//             ]
//         },
//         {
//             path: '/shuffle-deck',
//             component: () => 'Shuffle deck route'
//         }
//     ];

//     // Try with '/'
//     renderWithRouter(
//         '/',
//         <Routes routes={routeConfig} />
//     );

//     await new Promise((res) => setTimeout(res, dealHandRoutePreTimeout + 100));

//     expectMissingText('Base path route');
//     expectText('Root route');
//     expectMissingText('Root route base path');
//     expectMissingText('Surprise route');
//     expectText('Sub route');
//     expectMissingText('404');

//     // Try with '/'
//     renderWithRouter(
//         '/',
//         <Routes routes={routeConfig} />
//     );

//     expectText('Base path route');
//     expectMissingText('Root route');
//     expectMissingText('Root route base path');
//     expectMissingText('Surprise route');
//     expectMissingText('Sub route');
//     expectMissingText('404');

//     // Try with '/root/surprise'
//     renderWithRouter(
//         '/root/surprise',
//         <Routes routes={routeConfig} />
//     );

//     expectMissingText('Base path route');
//     expectText('Root route');
//     expectMissingText('Root route base path');
//     expectText('Surprise route');
//     expectMissingText('Sub route');
//     expectMissingText('404');

//     // Try with '/root/surprise'
//     const { history } = renderWithRouter(
//         '/root/nowhere',
//         <Routes routes={routeConfig} />
//     );

//     expectMissingText('Base path route');
//     expectMissingText('Root route');
//     expectMissingText('Root route base path');
//     expectMissingText('Surprise route');
//     expectMissingText('Sub route');
//     expectHistoryPathnameEquals(history, '/404');
// });

it('waits for "pre" to resolve before rendering a route', async () => {

    const PRE_TIMEOUT = 1000;

    renderWithRouter(
        '/root',
        <Routes routes={{
            path: '/root',
            pre: async () => await waitTimeout(PRE_TIMEOUT),
            component: () => 'Root route'
        }} />
    );

    expectMissingText('Root route');

    await waitTimeout(PRE_TIMEOUT / 2);

    expectMissingText('Root route');

    await waitForText('Root route');

    expectText('Root route');
});

it('renders "fallback" when specifying a "pre" function', async () => {

    const PRE_TIMEOUT = 1000;

    renderWithRouter(
        '/root',
        <Routes routes={{
            path: '/root',
            pre: async () => await waitTimeout(PRE_TIMEOUT),
            fallback: () => 'Fallback',
            component: () => 'Root route'
        }} />
    );

    expectMissingText('Root route');
    expectText('Fallback');

    await waitTimeout(PRE_TIMEOUT / 2);

    expectMissingText('Root route');
    expectText('Fallback');

    await waitForText('Root route');

    expectText('Root route');
    expectMissingText('Fallback');
});

it('renders "fallback" as children in "component" when "wrapFallbackWithComponent" is true, waits to render path children until "pre" resolves', async () => {

    const PRE_TIMEOUT = 1000;

    renderWithRouter(
        '/root/sub',
        <Routes routes={{
            path: '/root',
            pre: async () => await waitTimeout(PRE_TIMEOUT),
            component: componentWithChildren('Root route'),
            fallback: () => 'Fallback',
            wrapFallbackWithComponent: true,
            childRoutes: [
                {
                    path: '/sub',
                    component: () => 'Sub route'
                }
            ]
        }} />
    );

    expectText('Root route');
    expectText('Fallback');
    expectMissingText('Sub route');

    await waitTimeout(PRE_TIMEOUT / 2);

    expectText('Root route');
    expectText('Fallback');
    expectMissingText('Sub route');

    await waitForText('Sub route');

    expectText('Root route');
    expectMissingText('Fallback');
    expectText('Sub route');
});

it('redirects "from" a specific route "to" another', () => {

    const { history } = renderWithRouter(
        '/bad-route',
        <Routes routes={[
            {
                path: '/',
                component: () => 'Root route',
                exact: true
            },
            {
                path: '/login',
                component: () => 'Login route'
            },
            {
                redirect: { from: '/bad-route', to: '/login' }
            }
        ]} />
    );

    expect(history.location.pathname).toEqual('/login');
});

// const routeType = (...args) => T.shape({
//     path: T.string.isRequired,
//     exact: T.bool,
//     strict: T.bool,
//     sensitive: T.bool,
//     component: T.any,
//     pre: T.func,
//     fallback: T.any,
//     wrapFallbackWithComponent: T.bool,
//     childRoutes: T.arrayOf(routeType)
// }).apply(null, args);
