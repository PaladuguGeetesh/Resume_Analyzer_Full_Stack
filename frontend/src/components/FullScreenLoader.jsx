// Shared by every full-page async gate (session check, reports list, single report) so
// each one only has to supply its own message, not repeat the markup.
const FullScreenLoader = ({ message }) => (
    <main className='loading-screen'>
        <h1>{message}</h1>
    </main>
)

export default FullScreenLoader
