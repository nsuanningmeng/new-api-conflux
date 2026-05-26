/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useEffect, useRef, useState } from 'react';
import { Banner, Button, Col, Form, Row, Spin } from '@douyinfe/semi-ui';
import { BookOpen, TriangleAlert } from 'lucide-react';
import {
  API,
  removeTrailingSlash,
  showError,
  showSuccess,
} from '../../../helpers';
import { useTranslation } from 'react-i18next';

const toBoolean = (value) => value === true || value === 'true';

export default function SettingsPaymentGatewayConfluxAPI(props) {
  const { t } = useTranslation();
  const sectionTitle = props.hideSectionTitle
    ? undefined
    : t('Conflux Settings');
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState({
    ConfluxAPIEnabled: false,
    ConfluxAPIBaseURL: '',
    ConfluxAPIAppID: '',
    ConfluxAPIAppSecret: '',
    ConfluxAPIMchNo: '',
    ConfluxAPIGatewayNo: '',
    ConfluxAPINotifyURL: '',
    ConfluxAPIReturnURL: '',
    ConfluxAPICancelURL: '',
    ConfluxAPICurrency: 'USD',
    ConfluxAPIMinTopUp: 1,
  });
  const formApiRef = useRef(null);

  useEffect(() => {
    if (props.options && formApiRef.current) {
      const currentInputs = {
        ConfluxAPIEnabled: toBoolean(props.options.ConfluxAPIEnabled),
        ConfluxAPIBaseURL: props.options.ConfluxAPIBaseURL || '',
        ConfluxAPIAppID: props.options.ConfluxAPIAppID || '',
        ConfluxAPIAppSecret: props.options.ConfluxAPIAppSecret || '',
        ConfluxAPIMchNo: props.options.ConfluxAPIMchNo || '',
        ConfluxAPIGatewayNo: props.options.ConfluxAPIGatewayNo || '',
        ConfluxAPINotifyURL: props.options.ConfluxAPINotifyURL || '',
        ConfluxAPIReturnURL: props.options.ConfluxAPIReturnURL || '',
        ConfluxAPICancelURL: props.options.ConfluxAPICancelURL || '',
        ConfluxAPICurrency: props.options.ConfluxAPICurrency || 'USD',
        ConfluxAPIMinTopUp: parseInt(props.options.ConfluxAPIMinTopUp) || 1,
      };
      setInputs(currentInputs);
      formApiRef.current.setValues(currentInputs);
    }
  }, [props.options]);

  const handleFormChange = (values) => {
    setInputs(values);
  };

  const submitConfluxAPISetting = async () => {
    setLoading(true);
    try {
      const options = [
        {
          key: 'ConfluxAPIEnabled',
          value: inputs.ConfluxAPIEnabled ? 'true' : 'false',
        },
        {
          key: 'ConfluxAPIBaseURL',
          value: inputs.ConfluxAPIBaseURL || '',
        },
        { key: 'ConfluxAPIAppID', value: inputs.ConfluxAPIAppID || '' },
        { key: 'ConfluxAPIMchNo', value: inputs.ConfluxAPIMchNo || '' },
        {
          key: 'ConfluxAPIGatewayNo',
          value: inputs.ConfluxAPIGatewayNo || '',
        },
        {
          key: 'ConfluxAPINotifyURL',
          value: inputs.ConfluxAPINotifyURL || '',
        },
        {
          key: 'ConfluxAPIReturnURL',
          value: inputs.ConfluxAPIReturnURL || '',
        },
        {
          key: 'ConfluxAPICancelURL',
          value: inputs.ConfluxAPICancelURL || '',
        },
        {
          key: 'ConfluxAPICurrency',
          value: inputs.ConfluxAPICurrency || 'USD',
        },
        {
          key: 'ConfluxAPIMinTopUp',
          value: String(inputs.ConfluxAPIMinTopUp || 1),
        },
      ];

      if (inputs.ConfluxAPIAppSecret) {
        options.push({
          key: 'ConfluxAPIAppSecret',
          value: inputs.ConfluxAPIAppSecret,
        });
      }

      const results = await Promise.all(
        options.map((opt) =>
          API.put('/api/option/', {
            key: opt.key,
            value: opt.value,
          }),
        ),
      );

      const errorResults = results.filter((res) => !res.data.success);
      if (errorResults.length > 0) {
        errorResults.forEach((res) => showError(res.data.message));
      } else {
        showSuccess(t('Updated successfully'));
        props.refresh?.();
      }
    } catch (error) {
      showError(t('Update failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Spin spinning={loading}>
      <Form
        initValues={inputs}
        onValueChange={handleFormChange}
        getFormApi={(api) => (formApiRef.current = api)}
      >
        <Form.Section text={sectionTitle}>
          <Banner
            type='info'
            icon={<BookOpen size={16} />}
            description={
              <>
                {t(
                  'Obtain App ID, App Secret, merchant number, and gateway number from Conflux.'
                )}
                <br />
                {t('Notify URL')}:
                {inputs.ConfluxAPINotifyURL ||
                  `${props.options.ServerAddress ? removeTrailingSlash(props.options.ServerAddress) : t('Website Address')}/api/confluxapi/notify`}
              </>
            }
            style={{ marginBottom: 12 }}
          />
          <Banner
            type='warning'
            icon={<TriangleAlert size={16} />}
            description={t('Only Conflux wallet redirect methods are supported')}
            style={{ marginBottom: 16 }}
          />
          <Row gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Switch
                field='ConfluxAPIEnabled'
                size='default'
                checkedText='｜'
                uncheckedText='〇'
                label={t('Enable Conflux')}
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input
                field='ConfluxAPICurrency'
                label={t('Currency')}
                placeholder='USD'
              />
            </Col>
          </Row>
          <Row
            gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}
            style={{ marginTop: 16 }}
          >
            <Col xs={24} sm={24} md={12} lg={12} xl={12}>
              <Form.Input
                field='ConfluxAPIBaseURL'
                label={t('Request URL')}
                placeholder='https://api.example.com'
              />
            </Col>
          </Row>
          <Row
            gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}
            style={{ marginTop: 16 }}
          >
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input
                field='ConfluxAPIAppID'
                label='App ID'
                placeholder='app_xxx'
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input
                field='ConfluxAPIAppSecret'
                label='App Secret'
                placeholder={t('Leave blank unless updating')}
                type='password'
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input
                field='ConfluxAPIMchNo'
                label={t('Merchant number')}
                placeholder='MCH_xxx'
              />
            </Col>
          </Row>
          <Row
            gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}
            style={{ marginTop: 16 }}
          >
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input
                field='ConfluxAPIGatewayNo'
                label={t('Gateway number')}
                placeholder='GATEWAY_xxx'
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input
                field='ConfluxAPINotifyURL'
                label={t('Notify URL')}
                placeholder='https://example.com/api/confluxapi/notify'
              />
            </Col>
          </Row>
          <Row
            gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}
            style={{ marginTop: 16 }}
          >
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input
                field='ConfluxAPIReturnURL'
                label={t('Success Redirect URL')}
                placeholder='https://example.com/payment/success'
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input
                field='ConfluxAPICancelURL'
                label={t('Cancel Redirect URL')}
                placeholder='https://example.com/console/topup'
              />
            </Col>
          </Row>
          <Row
            gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}
            style={{ marginTop: 16 }}
          >
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.InputNumber
                field='ConfluxAPIMinTopUp'
                label={t('Minimum top-up amount')}
                min={1}
                precision={0}
              />
            </Col>
          </Row>
          <Button onClick={submitConfluxAPISetting}>
            {t('Save Conflux settings')}
          </Button>
        </Form.Section>
      </Form>
    </Spin>
  );
}
