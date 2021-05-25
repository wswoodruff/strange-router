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

const expectText = (text) => expect(getByText(text)).toBeDefined();
const expectMissingText = (text) => expect(() => getByText(text)).toThrow();

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

it('passes childRoute as "children" prop', () => {

    const routes = [
        {
            path: '/root',
            component: ({ children }) => (

                <div>
                    <div>Root route</div>
                    <div>{children}</div>
                </div>
            ),
            childRoutes: [
                {
                    path: '/nested',
                    component: () => 'Nested route'
                }
            ]
        }
    ];

    renderWithRouter(
        '/root',
        <Routes routes={routes} />
    );

    expectText('Root route');
    expectMissingText('Nested route');

    renderWithRouter(
        '/root/nested',
        <Routes routes={routes} />
    );

    expectText('Root route');
    expectText('Nested route');
});

it('renders childRoutes many levels deep', () => {

    const routes = [
        {
            path: '/root',
            component: ({ children }) => (

                <div>
                    <div>Root route</div>
                    <div>{children}</div>
                </div>
            ),
            childRoutes: [
                {
                    path: '/nested-sibling',
                    component: () => 'Nested sibling'
                },
                {
                    path: '/nested',
                    component: ({ children }) => (

                        <div>
                            <div>Nested route</div>
                            <div>{children}</div>
                        </div>
                    ),
                    childRoutes: [
                        {
                            path: '/double',
                            component: ({ children }) => (

                                <div>
                                    <div>Double nested</div>
                                    <div>{children}</div>
                                </div>
                            ),
                            childRoutes: [
                                {
                                    path: '/triple',
                                    component: ({ children }) => (

                                        <div>
                                            <div>Triple nested</div>
                                            <div>{children}</div>
                                        </div>
                                    ),
                                    childRoutes: [
                                        {
                                            path: '/quadruple',
                                            component: ({ children }) => (

                                                <div>
                                                    <div>Quadruple nested</div>
                                                    <div>{children}</div>
                                                </div>
                                            ),
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
        component: ({ children }) => (

            <div>
                <div>Root route</div>
                <div>{children}</div>
            </div>
        ),
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

    await waitFor(() => expectText('Root route'));

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

    await waitFor(() => expectText('Root route'));

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
            component: ({ children }) => (

                <div>
                    <div>Root route</div>
                    <div>{children}</div>
                </div>
            ),
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

    await waitFor(() => expectText('Sub route'));

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
    expectMissingText('Fallback');
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
