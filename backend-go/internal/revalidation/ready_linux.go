//go:build linux

package revalidation

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"golang.org/x/sys/unix"
)

const readyAuthorityPath = "/etc/aktau-c2/ready.json"
const readySupervisorPath = "/usr/local/libexec/aktau-c2/c2-production-supervisor.mjs"

type readyAuthority struct {
	Version              int    `json:"version"`
	AttemptID            string `json:"attemptId"`
	SourceSHA            string `json:"sourceSha"`
	FrontendSHA          string `json:"frontendSha,omitempty"`
	DeploymentID         string `json:"deploymentId,omitempty"`
	ConfirmedAt          string `json:"confirmedAt"`
	BootID               string `json:"bootId"`
	OperatorUID          int    `json:"operatorUid"`
	OperatorGID          int    `json:"operatorGid"`
	SupervisorPID        int    `json:"supervisorPid"`
	SupervisorStartTicks string `json:"supervisorStartTicks"`
	NodeExecutable       string `json:"nodeExecutable"`
	NodeSHA256           string `json:"nodeSha256"`
	CommandSHA256        string `json:"commandSha256"`
	SupervisorSHA256     string `json:"supervisorSha256"`
	IngestSHA256         string `json:"ingestSha256"`
	RelaySHA256          string `json:"relaySha256"`
	ExpiresAt            string `json:"expiresAt"`
	EvidencePolicy       string `json:"evidencePolicy,omitempty"`
	PolicyVersion        int    `json:"policyVersion,omitempty"`
	PolicySHA256         string `json:"policySha256,omitempty"`
}

func rootReadyFile(path string, limit int64) ([]byte, error) {
	fd, err := unix.Open("/", unix.O_RDONLY|unix.O_DIRECTORY|unix.O_CLOEXEC, 0)
	if err != nil {
		return nil, err
	}
	defer func() { _ = unix.Close(fd) }()
	for _, p := range strings.Split(strings.TrimPrefix(filepath.Dir(path), "/"), "/") {
		next, e := unix.Openat(fd, p, unix.O_RDONLY|unix.O_DIRECTORY|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0)
		if e != nil {
			return nil, e
		}
		_ = unix.Close(fd)
		fd = next
		var st unix.Stat_t
		if unix.Fstat(fd, &st) != nil || st.Uid != 0 || st.Mode&0022 != 0 {
			return nil, errors.New("authority")
		}
	}
	f, e := unix.Openat(fd, filepath.Base(path), unix.O_RDONLY|unix.O_NONBLOCK|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0)
	if e != nil {
		return nil, e
	}
	file := os.NewFile(uintptr(f), "")
	defer file.Close()
	var st unix.Stat_t
	if unix.Fstat(f, &st) != nil || st.Mode&unix.S_IFMT != unix.S_IFREG || st.Uid != 0 || st.Mode&0022 != 0 || st.Nlink != 1 || st.Size < 1 || st.Size > limit {
		return nil, errors.New("authority")
	}
	b, e := io.ReadAll(io.LimitReader(file, limit+1))
	var after unix.Stat_t
	if e != nil || int64(len(b)) != st.Size || unix.Fstat(f, &after) != nil || after.Dev != st.Dev || after.Ino != st.Ino || after.Mode != st.Mode || after.Uid != st.Uid || after.Gid != st.Gid || after.Nlink != st.Nlink || after.Size != st.Size || after.Mtim != st.Mtim || after.Ctim != st.Ctim {
		return nil, errors.New("authority")
	}
	return b, nil
}

func processReadyIdentity(pid int) (start, commandDigest, binaryDigest string, parent int, err error) {
	fail := func() (string, string, string, int, error) { return "", "", "", 0, errors.New("process_identity") }
	base := "/proc/" + strconv.Itoa(pid)
	raw, e := os.ReadFile(base + "/stat")
	if e != nil {
		return fail()
	}
	end := strings.LastIndex(string(raw), ") ")
	if end < 0 {
		return fail()
	}
	fields := strings.Fields(string(raw)[end+2:])
	if len(fields) < 20 {
		return fail()
	}
	parent, e = strconv.Atoi(fields[1])
	if e != nil {
		return fail()
	}
	start = fields[19]
	cmd, e := os.ReadFile(base + "/cmdline")
	if e != nil || len(cmd) == 0 || len(cmd) > 8192 {
		return fail()
	}
	c := sha256.Sum256(cmd)
	commandDigest = hex.EncodeToString(c[:])
	// /proc/PID/exe is the deliberate kernel-pinned executable handle, not an
	// operator path/symlink. Verify the actual open inode is root-controlled.
	f, e := os.Open(base + "/exe")
	if e != nil {
		return fail()
	}
	defer f.Close()
	var st unix.Stat_t
	if unix.Fstat(int(f.Fd()), &st) != nil || st.Mode&unix.S_IFMT != unix.S_IFREG || st.Uid != 0 || st.Mode&0022 != 0 || st.Size < 4 || st.Size > 256<<20 {
		return fail()
	}
	h := sha256.New()
	if _, e = io.Copy(h, io.LimitReader(f, 256<<20+1)); e != nil {
		return fail()
	}
	binaryDigest = hex.EncodeToString(h.Sum(nil))
	return start, commandDigest, binaryDigest, parent, nil
}

// Non-dumpable peers intentionally deny /proc/PID/exe to another unprivileged
// process. Root attests their immutable executable before issuing ready.json;
// consumers recheck public birth/command identity and the protected proc owner.
func protectedReadyProcess(pid int) (start, cmd string, parent int, err error) {
	fail := func() (string, string, int, error) { return "", "", 0, errors.New("process_identity") }
	base := "/proc/" + strconv.Itoa(pid)
	var st unix.Stat_t
	if unix.Stat(base+"/status", &st) != nil || st.Uid != 0 {
		return fail()
	}
	raw, e := os.ReadFile(base + "/stat")
	if e != nil {
		return fail()
	}
	end := strings.LastIndex(string(raw), ") ")
	if end < 0 {
		return fail()
	}
	fields := strings.Fields(string(raw)[end+2:])
	if len(fields) < 20 {
		return fail()
	}
	parent, e = strconv.Atoi(fields[1])
	if e != nil {
		return fail()
	}
	argv, e := os.ReadFile(base + "/cmdline")
	if e != nil || len(argv) < 1 || len(argv) > 8192 {
		return fail()
	}
	sum := sha256.Sum256(argv)
	return fields[19], hex.EncodeToString(sum[:]), parent, nil
}

func loadReadyAuthority(ctx context.Context, id string, p *readyProgress) (readyAuthority, []byte, error) {
	fail := func(reason readyReason) (readyAuthority, []byte, error) {
		return readyAuthority{}, nil, readyFailure(reason)
	}
	p.enter(phaseAuthorityRead)
	raw, err := rootReadyFile(readyAuthorityPath, ReadyLimit)
	if err != nil {
		return fail(reasonAuthorityUnavailable)
	}
	p.enter(phaseAuthorityValidate)
	var a readyAuthority
	if !canonicalReady(raw, &a) || !validReadyPolicy(a.Version, a.FrontendSHA, a.DeploymentID, a.EvidencePolicy, a.PolicyVersion, a.PolicySHA256) || a.AttemptID != id || !ValidAttemptID(id) || a.OperatorUID <= 0 || a.OperatorUID != os.Geteuid() || a.OperatorGID != os.Getegid() || a.SupervisorPID < 1 || !nsPattern.MatchString(a.SupervisorStartTicks) {
		return fail(reasonAuthorityInvalid)
	}
	for _, d := range []string{a.NodeSHA256, a.CommandSHA256, a.SupervisorSHA256, a.IngestSHA256, a.RelaySHA256} {
		if !readyDigest.MatchString(d) {
			return fail(reasonAuthorityInvalid)
		}
	}
	confirmed, c := exactReadyTime(a.ConfirmedAt)
	expiry, e := exactReadyTime(a.ExpiresAt)
	if !readySHA.MatchString(a.SourceSHA) || !uuidPattern.MatchString(a.BootID) {
		return fail(reasonAuthorityInvalid)
	}
	if !c || !e || confirmed.After(time.Now()) || !expiry.After(time.Now()) || expiry.Sub(confirmed) <= 0 || expiry.Sub(confirmed) > 35*time.Minute {
		return fail(reasonLifetime)
	}
	boot, err := BootID()
	if err != nil || boot != a.BootID {
		return fail(reasonBoot)
	}
	if !filepath.IsAbs(a.NodeExecutable) || filepath.Clean(a.NodeExecutable) != a.NodeExecutable || len(a.NodeExecutable) > 256 || strings.IndexFunc(a.NodeExecutable, func(r rune) bool {
		return !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || strings.ContainsRune("_./-", r))
	}) >= 0 {
		return fail(reasonAuthorityInvalid)
	}
	p.enter(phaseNodeHash)
	node, err := rootReadyFile(a.NodeExecutable, 256<<20)
	if err != nil || len(node) < 4 || string(node[:4]) != "\x7fELF" {
		return fail(reasonFile)
	}
	nodeSum := sha256.Sum256(node)
	if hex.EncodeToString(nodeSum[:]) != a.NodeSHA256 {
		return fail(reasonDigest)
	}
	p.enter(phaseRelayHash)
	relay, err := rootReadyFile("/usr/local/libexec/aktau-c2/relayprobe", 64<<20)
	if err != nil {
		return fail(reasonFile)
	}
	relaySum := sha256.Sum256(relay)
	if hex.EncodeToString(relaySum[:]) != a.RelaySHA256 {
		return fail(reasonDigest)
	}
	p.enter(phaseSupervisorIdentity)
	start, cmd, parent, err := protectedReadyProcess(a.SupervisorPID)
	if err != nil || start != a.SupervisorStartTicks || cmd != a.CommandSHA256 {
		return fail(reasonProcess)
	}
	var parentStat unix.Stat_t
	if unix.Stat("/proc/"+strconv.Itoa(parent), &parentStat) != nil || parentStat.Uid != 0 {
		return fail(reasonProcess)
	}
	status, err := os.ReadFile("/proc/" + strconv.Itoa(a.SupervisorPID) + "/status")
	if err != nil || !strings.Contains(string(status), "TracerPid:\t0\n") {
		return fail(reasonProcess)
	}
	for prefix, want := range map[string]int{"Uid:": a.OperatorUID, "Gid:": a.OperatorGID} {
		found := false
		for _, line := range strings.Split(string(status), "\n") {
			if !strings.HasPrefix(line, prefix) {
				continue
			}
			fields := strings.Fields(line)
			if len(fields) != 5 {
				return fail(reasonProcess)
			}
			for _, v := range fields[1:] {
				n, e := strconv.Atoi(v)
				if e != nil || n != want {
					return fail(reasonProcess)
				}
			}
			found = true
		}
		if !found {
			return fail(reasonProcess)
		}
	}
	p.enter(phaseSupervisorHash)
	module, err := rootReadyFile(readySupervisorPath, 2<<20)
	if err != nil {
		return fail(reasonFile)
	}
	sum := sha256.Sum256(module)
	if hex.EncodeToString(sum[:]) != a.SupervisorSHA256 {
		return fail(reasonDigest)
	}
	p.enter(phaseSelfIdentity)
	_, _, self, _, err := processReadyIdentity(os.Getpid())
	if err != nil || readyContextEnded(ctx) {
		return fail(reasonProcess)
	}
	if self != a.IngestSHA256 {
		return fail(reasonDigest)
	}
	return a, raw, nil
}

func socketReadyStat(path string) (unix.Stat_t, bool) {
	parent, safe := privateParent(path, unix.Lstat)
	if !safe || parent.Mode&07777 != 0700 || parent.Gid != uint32(os.Getegid()) {
		return unix.Stat_t{}, false
	}
	fd, err := unix.Open(filepath.Dir(path), unix.O_RDONLY|unix.O_DIRECTORY|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0)
	if err != nil {
		return unix.Stat_t{}, false
	}
	defer unix.Close(fd)
	var actual, st unix.Stat_t
	if unix.Fstat(fd, &actual) != nil || actual.Dev != parent.Dev || actual.Ino != parent.Ino || actual.Uid != parent.Uid || actual.Gid != parent.Gid || actual.Mode != parent.Mode {
		return st, false
	}
	if unix.Fstatat(fd, filepath.Base(path), &st, unix.AT_SYMLINK_NOFOLLOW) != nil || st.Mode&unix.S_IFMT != unix.S_IFSOCK || st.Mode&07777 != 0600 || st.Uid != uint32(os.Geteuid()) || st.Gid != uint32(os.Getegid()) {
		return st, false
	}
	return st, true
}

// Fixed production dependencies. Only package-private tests can supply an OS
// model to the core; no exported authority/path/factory/env override is added.
func RequestReadyDetailed(parent context.Context, fifo, id string) (*ReadyTicket, ReadyDiagnostic) {
	return requestReadyAdmission(parent, fifo, id, loadReadyAuthority, requestReadyObserved)
}

type readyLoader func(context.Context, string, *readyProgress) (readyAuthority, []byte, error)
type readyExchange func(context.Context, string, string, readyAuthority, func() bool, *readyProgress) (*ReadyTicket, readyReason)

// Zero I/O for absent/malformed opt-in. One deadline, worker and terminal
// snapshot; Stage keeps its original parent context and never waits for a late
// diagnostic worker. The buffered result permits that worker to finish safely.
func requestReadyAdmission(parent context.Context, fifo, id string, load readyLoader, exchange readyExchange) (*ReadyTicket, ReadyDiagnostic) {
	started := time.Now()
	p := &readyProgress{}
	finish := func(outcome readyOutcome, reason readyReason) (*ReadyTicket, ReadyDiagnostic) {
		return nil, ReadyDiagnostic{phase: p.snapshot(), reason: reason, outcome: outcome, elapsedMS: min(ReadyBudget.Milliseconds(), max(int64(0), time.Since(started).Milliseconds())), deadlineOrCancelled: reason == reasonDeadline || reason == reasonParentDeadline || reason == reasonCancelled}
	}
	contextReason := func() readyReason {
		if errors.Is(parent.Err(), context.Canceled) {
			return reasonCancelled
		}
		deadline, hasDeadline := parent.Deadline()
		if errors.Is(parent.Err(), context.DeadlineExceeded) || hasDeadline && !time.Now().Before(deadline) {
			return reasonParentDeadline
		}
		return reasonDeadline
	}
	if fifo == "" || !ValidAttemptID(id) {
		return finish(outcomeDisabled, reasonDisabled)
	}
	expected := "/var/lib/aktau-sync/c2/" + id + "/event.fifo"
	if fifo != expected {
		return finish(outcomeNotArmed, reasonConfiguration)
	}
	if readyContextEnded(parent) {
		return finish(outcomeNotArmed, contextReason())
	}
	ctx, cancel := context.WithTimeout(parent, ReadyBudget)
	defer cancel()
	// Admission file/proc reads are also inside the caller's wall-clock budget.
	// A canceled caller never waits for a slow local filesystem. One bounded
	// worker only; no retry, no additional request and no publication ownership.
	type result struct {
		ticket *ReadyTicket
		reason readyReason
	}
	done := make(chan result, 1)
	go func() {
		a, raw, err := load(ctx, id, p)
		if err != nil || readyContextEnded(ctx) {
			reason := reasonRejected
			var failure readyFailure
			if errors.As(err, &failure) {
				reason = readyReason(failure)
			}
			done <- result{nil, reason}
			return
		}
		ticket, reason := exchange(ctx, filepath.Join(filepath.Dir(fifo), "ready.sock"), id, a, func() bool {
			p.enter(phaseAuthorityRecheck)
			current, e := rootReadyFile(readyAuthorityPath, ReadyLimit)
			return e == nil && string(current) == string(raw) && !readyContextEnded(ctx)
		}, p)
		done <- result{ticket, reason}
	}()
	select {
	case <-ctx.Done():
		return finish(outcomeNotArmed, contextReason())
	case result := <-done:
		if readyContextEnded(ctx) {
			return finish(outcomeNotArmed, contextReason())
		}
		if result.ticket == nil {
			return finish(outcomeNotArmed, result.reason)
		}
		p.enter(phaseComplete)
		_, diagnostic := finish(outcomeArmed, reasonReady)
		return result.ticket, diagnostic
	}
}

func requestReady(ctx context.Context, path, id string, a readyAuthority, unchanged func() bool) *ReadyTicket {
	ticket, _ := requestReadyObserved(ctx, path, id, a, unchanged, nil)
	return ticket
}
func requestReadyObserved(ctx context.Context, path, id string, a readyAuthority, unchanged func() bool, p *readyProgress) (*ReadyTicket, readyReason) {
	p.enter(phaseSocketCheck)
	before, safe := socketReadyStat(path)
	if !safe || readyContextEnded(ctx) {
		return nil, reasonSocket
	}
	p.enter(phaseConnect)
	c, err := (&net.Dialer{}).DialContext(ctx, "unix", path)
	if err != nil {
		return nil, reasonTransport
	}
	defer c.Close()
	stop := context.AfterFunc(ctx, func() { _ = c.Close() })
	defer stop()
	deadline, ok := ctx.Deadline()
	if !ok || c.SetDeadline(deadline) != nil {
		return nil, reasonTransport
	}
	conn, ok := c.(*net.UnixConn)
	if !ok {
		return nil, reasonTransport
	}
	control, err := conn.SyscallConn()
	if err != nil {
		return nil, reasonTransport
	}
	p.enter(phasePeerCheck)
	peerOK := false
	if control.Control(func(fd uintptr) {
		peer, e := unix.GetsockoptUcred(int(fd), unix.SOL_SOCKET, unix.SO_PEERCRED)
		peerOK = e == nil && int(peer.Uid) == a.OperatorUID && int(peer.Gid) == a.OperatorGID
		if !peerOK {
			return
		}
		if a.RelaySHA256 == "" {
			peerOK = int(peer.Pid) == a.SupervisorPID
			return
		} // private test-only record; production admission requires the digest
		_, command, parent, identityErr := protectedReadyProcess(int(peer.Pid))
		expected := sha256.Sum256([]byte("/usr/local/libexec/aktau-c2/relayprobe\x00ready-server\x00" + id + "\x00"))
		peerOK = identityErr == nil && parent == a.SupervisorPID && command == hex.EncodeToString(expected[:])
	}) != nil || !peerOK {
		return nil, reasonPeer
	}
	p.enter(phaseSocketRecheck)
	after, safe := socketReadyStat(path)
	if !safe || before.Dev != after.Dev || before.Ino != after.Ino || before.Mode != after.Mode {
		return nil, reasonSocketChanged
	}
	if !unchanged() {
		return nil, reasonAuthorityChanged
	}
	p.enter(phaseRequestWrite)
	var nonce [16]byte
	if _, err = rand.Read(nonce[:]); err != nil {
		return nil, reasonNonce
	}
	req := ReadyRequest{1, id, hex.EncodeToString(nonce[:])}
	encoded, err := json.Marshal(req)
	if err != nil {
		return nil, reasonTransport
	}
	encoded = append(encoded, '\n')
	n, err := conn.Write(encoded)
	if err != nil || n != len(encoded) || conn.CloseWrite() != nil {
		return nil, reasonTransport
	}
	p.enter(phaseResponseRead)
	payload, err := io.ReadAll(io.LimitReader(conn, ReadyLimit+1))
	if err != nil {
		return nil, reasonTransport
	}
	p.enter(phaseResponseValidate)
	var r ReadyResponse
	if !canonicalReady(payload, &r) || !validReadyResponse(r, req, time.Now()) || r.Version != a.Version || r.EvidencePolicy != a.EvidencePolicy || r.PolicyVersion != a.PolicyVersion || r.PolicySHA256 != a.PolicySHA256 || r.SourceSHA != a.SourceSHA || r.FrontendSHA != a.FrontendSHA || r.DeploymentID != a.DeploymentID || r.ConfirmedAt != a.ConfirmedAt || r.BootID != a.BootID || r.ExpiresAt != a.ExpiresAt {
		return nil, reasonResponse
	}
	if !unchanged() || readyContextEnded(ctx) {
		return nil, reasonAuthorityChanged
	}
	p.enter(phaseSocketRecheck)
	after, safe = socketReadyStat(path)
	if !safe || before.Dev != after.Dev || before.Ino != after.Ino {
		return nil, reasonSocketChanged
	}
	if readyContextEnded(ctx) {
		return nil, reasonDeadline
	}
	return &ReadyTicket{response: r}, reasonReady
}
