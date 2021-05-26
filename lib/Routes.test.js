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
const waitForMissingText = async (text) => await waitFor(() => expectMissingText(text));

// divs wrapped around text help with selecting it with ex: the 'expectText' helpers
const componentWithChildren = (name) => {

    return ({ children }) => (

        <div>
            <div>{name}</div>
            {children && <div>{children}</div>}
        </div>
    );
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
            exact: true,
            component: () => 'Route one'
        },
        {
            path: '/two',
            exact: true,
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

it.only('passes childRoute as "children" prop', () => {

    const routes = [
        {
            path: '/root',
            component: componentWithChildren('Root route'),
            childRoutes: [
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

    debug();

    expectText('Root route');
    expectMissingText('Nested route');

    // expectContainerContents(
    //     firstContainer,
    //     '<div><div>Root route</div><div></div></div>'
    // );

    // const { container: secondContainer } = renderWithRouter(
    //     '/root/nested',
    //     <Routes routes={routes} />
    // );

    // expectText('Root route');
    // expectText('Nested route');

    // expectContainerContents(
    //     secondContainer,
    //     '<div><div>Root route</div><div>Nested route</div></div>'
    // );
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

it('passes along "exact" to routes', () => {

    const routeConfig = {
        path: '/',
        exact: true,
        component: componentWithChildren('Root route'),
        childRoutes: [
            {
                path: '/sub',
                component: () => 'Sub route'
            }
        ]
    };

    // Try with '/'
    renderWithRouter(
        '/',
        <Routes routes={routeConfig} />
    );

    expectText('Root route');

    // Try with '/sub'
    renderWithRouter(
        '/sub',
        <Routes routes={routeConfig} />
    );

    // Neither will render, because '/sub' is a child of '/'
    // but it's set to match with 'exact: true'
    expectMissingText('Root route');
    expectMissingText('Sub route');

    // Try with '/sub' and 'exact: false'
    renderWithRouter(
        '/sub',
        <Routes routes={{
            ...routeConfig,
            exact: false
        }} />
    );

    expectText('Root route');
    expectText('Sub route');
});

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

it('redirects to closest match if multiple redirects exist', () => {

    // NOTE
    // At the moment, we haven't figured out how to test changes in the DOM
    // after history pushes or redirects to a new route after rendering.
    // With the current setup, if history changes location after rendering
    // the screen will print empty divs.
    // For that reason we'll only compare the 'history.location.pathname' for these tests

    const routes = [
        {
            path: '/',
            component: componentWithChildren('Root route'),
            exact: true
        },
        {
            path: '/spaceship',
            component: componentWithChildren('Spaceship route'),
            childRoutes: [
                {
                    path: '/doghouse',
                    component: componentWithChildren('Spaceship doghouse route'),
                    childRoutes: [
                        {
                            path: '/sleeping',
                            component: () => 'Spaceship doghouse sleeping route'
                        },
                        { redirect: { to: '/magic/dude' } }
                    ]
                }
            ]
        },
        {
            path: '/cave',
            component: componentWithChildren('Cave route'),
            childRoutes: [
                {
                    path: '/lvl-1',
                    component: componentWithChildren('Cave level 1 route'),
                    childRoutes: [
                        {
                            path: '/lvl-2',
                            component: componentWithChildren('Cave level 2 route'),
                            childRoutes: [
                                {
                                    path: '/lvl-3',
                                    component: () => 'Cave level 3 route'
                                }
                            ]
                        }
                    ]
                }
            ]
        },
        {
            path: '/wormhole',
            component: componentWithChildren('Wormhole route'),
            childRoutes: [
                {
                    //
                }
            ]
        },
        {
            path: '/random',
            component: () => 'Random route'
        },
        {
            path: '/more-specific-redirect',
            component: () => 'More specific redirect route'
        },
        {
            path: '/dog-route',
            component: componentWithChildren('Dog route'),
            childRoutes: [
                {
                    path: '/good',
                    component: componentWithChildren('Good dog route'),
                    childRoutes: [
                        {
                            path: '/only-throw-no-take',
                            component: () => 'Only throw no take route'
                        },
                        { redirect: { to: '/more-specific-redirect' } }
                    ]
                },
                { redirect: { to: '/random' } }
            ]
        },
        {
            path: '/mouse',
            component: () => 'Mouse route'
        },
        {
            path: '/magic',
            component: componentWithChildren('Magic route'),
            childRoutes: [
                {
                    path: '/dude',
                    component: () => 'Magic dude route'
                },
                { redirect: { to: '/mouse' } }
            ]
        },
        { redirect: { to: '/login' } }
    ];

    // Matches '/magic' and redirects to '/mouse'
    const { history: magicBogusHistory } = renderWithRouter(
        '/magic/bogus',
        <Routes routes={routes} />
    );
    expectHistoryPathnameEquals(magicBogusHistory, '/mouse');

    // Doesn't match any routes at the base level, falls back to '/login'
    const { history: badRouteHistory } = renderWithRouter(
        '/bad-route',
        <Routes routes={routes} />
    );
    expectHistoryPathnameEquals(badRouteHistory, '/login');

    // Doesn't match any routes at the base level plus subpath, falls back to '/login'
    const { history: badRouteSuperBadHistory } = renderWithRouter(
        '/bad-route/super-bad',
        <Routes routes={routes} />
    );
    expectHistoryPathnameEquals(badRouteSuperBadHistory, '/login');

    // Matches '/dog-route/good' and renders sibling redirect '/more-specific-redirect'
    const { history: dogRouteGoodBadCuriousHistory } = renderWithRouter(
        '/dog-route/good/bad-curious',
        <Routes routes={routes} />
    );
    expectHistoryPathnameEquals(dogRouteGoodBadCuriousHistory, '/more-specific-redirect');

    // Matches '/dog-route' and renders child redirect '/random'
    const { history: dogRouteJustChillinHistory } = renderWithRouter(
        '/dog-route/chillin',
        <Routes routes={routes} />
    );
    expectHistoryPathnameEquals(dogRouteJustChillinHistory, '/random');

    // Matches '/dog-route' and renders child redirect '/random'
    const { history: spaceshipDoghouseChillinHistory } = renderWithRouter(
        '/spaceship/doghouse/chillin',
        <Routes routes={routes} />
    );
    expectHistoryPathnameEquals(spaceshipDoghouseChillinHistory, '/magic/dude');

    // Matches the deepest cave route '/cave/lvl-1/lvl-2/lvl-3'
    const { history: caveLvl3History } = renderWithRouter(
        '/cave/lvl-1/lvl-2/lvl-3',
        <Routes routes={routes} />
    );
    expectHistoryPathnameEquals(caveLvl3History, '/cave/lvl-1/lvl-2/lvl-3');

    // Redirects up 2 levels to the root redirect '/login'
    const { history: lvl2CaveUnknownHistory } = renderWithRouter(
        '/cave/lvl-1/lvl-2/lvl-unknown',
        <Routes routes={routes} />
    );
    expectHistoryPathnameEquals(lvl2CaveUnknownHistory, '/login');

    // // Redirects all the way up to the root redirect '/login' from the deepest cave route '/cave/lvl-1/lvl-2/lvl-3/lvl-unknown'
    // const { history: lvl3CaveUnknownHistory } = renderWithRouter(
    //     '/cave/lvl-1/lvl-2/lvl-3/lvl-unknown',
    //     <Routes routes={routes} />
    // );
    // expectHistoryPathnameEquals(lvl3CaveUnknownHistory, '/login');
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
