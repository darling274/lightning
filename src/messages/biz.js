import { randomBytes } from 'crypto'
const FLOWS_MAP = {
    mpm: true,
    cta_catalog: true,
    send_location: true,
    call_permission_request: true,
    wa_payment_transaction_details: true,
    automated_greeting_message_view_catalog: true
};
const DECISION_SOURCE_CONTENT = [
    {
        tag: 'decision_source',
        attrs: { value: 'df' }
    }
];
const LIST_TYPE_CONTENT = {
    tag: 'list',
    attrs: { v: '2', type: 'product_list' }
};
const NATIVE_FLOW_ATTRIBUTE = { type: 'native_flow', v: '1' };
const MIXED_NATIVE_FLOW = {
    tag: 'interactive',
    attrs: NATIVE_FLOW_ATTRIBUTE,
    content: [
        {
            tag: 'native_flow',
            attrs: { v: '9', name: 'mixed' }
        }
    ]
};
export const getBizBinaryNode = (message) => {
    const flowMsg = message.interactiveMessage?.nativeFlowMessage;
    const firstButtonName = flowMsg?.buttons?.[0]?.name;
    const qualityContent = {
        tag: 'quality_control',
        attrs: {
            decision_id: randomBytes(20).toString('hex'),
            source_type: 'third_party'
        },
        content: DECISION_SOURCE_CONTENT
    };
    const bizAttributes = {
        actual_actors: '2',
        host_storage: '2',
        privacy_mode_ts: `${Date.now() / 1_000 | 0}`
    };
    if (firstButtonName === 'review_and_pay' || firstButtonName === 'payment_info') {
        bizAttributes.native_flow_name = firstButtonName === 'review_and_pay' ?
            'order_details' :
            firstButtonName;
        return {
            tag: 'biz',
            attrs: bizAttributes,
            content: [qualityContent]
        };
    }
    if (firstButtonName && FLOWS_MAP[firstButtonName]) {
        return {
            tag: 'biz',
            attrs: bizAttributes,
            content: [
                {
                    tag: 'interactive',
                    attrs: NATIVE_FLOW_ATTRIBUTE,
                    content: [
                        {
                            tag: 'native_flow',
                            attrs: { v: '2', name: firstButtonName }
                        }
                    ]
                },
                qualityContent
            ]
        };
    }
    const carouselFlow = message.interactiveMessage?.carouselMessage?.cards?.some(card => card?.nativeFlowMessage);
    if (flowMsg || carouselFlow || message.buttonsMessage || message.templateMessage) {
        return {
            tag: 'biz',
            attrs: bizAttributes,
            content: [
                MIXED_NATIVE_FLOW,
                qualityContent
            ]
        };
    }
    if (message.listMessage) {
        return {
            tag: 'biz',
            attrs: bizAttributes,
            content: [
                LIST_TYPE_CONTENT,
                qualityContent
            ]
        };
    }
    return {
        tag: 'biz',
        attrs: bizAttributes,
        content: [qualityContent]
    };
};

export const shouldIncludeBizBinaryNode = (message) => !!(message.buttonsMessage ||
    message.listMessage ||
    message.templateMessage ||
    (message.interactiveMessage &&
        (message.interactiveMessage.nativeFlowMessage ||
            message.interactiveMessage.carouselMessage?.cards?.some(card => card?.nativeFlowMessage))));
